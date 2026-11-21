#!/usr/bin/env node
/**
 * NFR-P5 load check: SESSIONS live sessions × PLAYERS players each, all running
 * concurrently against a locally started backend. Measures REST setup time and
 * the broadcast latency of every protocol phase (join, question open, answers,
 * reveal, winners).
 *
 * Usage: node scripts/load-test.mjs
 * Env:   API_URL (default http://localhost:3102/api)
 *        WS_URL  (default ws://localhost:3102/ws)
 *        SESSIONS (20), PLAYERS (50)
 */
import WebSocket from 'ws'

const API_URL = process.env.API_URL ?? 'http://localhost:3102/api'
const WS_URL = process.env.WS_URL ?? 'ws://localhost:3102/ws'
const SESSIONS = Number(process.env.SESSIONS ?? 20)
const PLAYERS = Number(process.env.PLAYERS ?? 50)

const runId = Date.now().toString(36).slice(-6)
const password = 'password1'

const api = async (path, { method = 'POST', token, body, query } = {}) => {
  const url = new URL(`${API_URL}${path}`)
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${await response.text()}`)
  }
  return response.status === 204 ? null : response.json()
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}
const stats = (name, values) => ({
  name,
  n: values.length,
  min: Math.round(Math.min(...values)),
  p50: Math.round(percentile(values, 50)),
  p95: Math.round(percentile(values, 95)),
  max: Math.round(Math.max(...values)),
})

/** Opens a socket, joins the session and resolves once SESSION_STATE arrives */
const connect = (user, sessionId) =>
  new Promise(async (resolve, reject) => {
    const { ticket } = await api('/auth/ws-ticket', { token: user.token })
    const ws = new WebSocket(`${WS_URL}?ticket=${ticket}`)
    const inbox = []
    const waiters = []
    const pushWaiter = (query, resolve2, timeout) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout waiting ${query.type}`)),
        timeout,
      )
      waiters.push({ ...query, resolve: resolve2, timer })
    }
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      const i = waiters.findIndex(
        (w) => w.type === msg.type && (w.match?.(msg.payload) ?? true),
      )
      if (i >= 0) {
        const [w] = waiters.splice(i, 1)
        clearTimeout(w.timer)
        w.resolve(msg.payload)
      } else inbox.push(msg)
    })
    ws.once('error', reject)
    ws.once('open', () => {
      ws.send(JSON.stringify({ type: 'JOIN_SESSION', payload: { sessionId } }))
    })
    const waitFor = (type, match = () => true, timeoutMs = 60_000) =>
      new Promise((res, rej) => {
        // drop stale messages of this type until one satisfies the predicate
        for (let i = inbox.length - 1; i >= 0; i--) {
          if (inbox[i].type === type) {
            const [msg] = inbox.splice(i, 1)
            if (match(msg.payload)) return res(msg.payload)
          }
        }
        pushWaiter({ type, match }, res, timeoutMs)
      })
    waitFor('SESSION_STATE').then(() => resolve({ ws, waitFor }))
  })

const now = () => performance.now()

const main = async () => {
  const t0 = now()
  console.log(`Load test: ${SESSIONS} sessions × ${PLAYERS} players vs ${API_URL}`)

  // --- setup: users, quizzes, sessions --------------------------------------
  const [hosts, players] = await Promise.all([
    Promise.all(
      Array.from({ length: SESSIONS }, (_, i) =>
        api('/users', { body: { name: `lt-${runId}-h${i}`, password } }),
      ),
    ),
    Promise.all(
      Array.from({ length: PLAYERS }, (_, i) =>
        api('/users', { body: { name: `lt-${runId}-p${i}`, password } }),
      ),
    ),
  ])

  const sessions = await Promise.all(
    hosts.map(async (host) => {
      const game = await api('/games', { token: host.token, body: { title: 'load' } })
      const question = await api('/questions', {
        token: host.token,
        body: { gameId: game.id, text: '2+2?', timeLimitSec: 60 },
      })
      await api('/accepted-answers/', {
        method: 'PUT',
        token: host.token,
        query: { questionId: question.id },
        body: [{ text: '4' }],
      })
      const { sessionId } = await api(`/games/${game.id}/sessions`, { token: host.token })
      return { host, sessionId }
    }),
  )
  const setupMs = now() - t0
  console.log(`Setup (users + quizzes + sessions): ${(setupMs / 1000).toFixed(1)} s`)

  // --- connect: hosts + all players -----------------------------------------
  const tConnect = now()
  for (const session of sessions) {
    session.hostSock = await connect(session.host, session.sessionId)
  }
  const hostJoinMs = now() - tConnect

  const joinLatencies = []
  for (const session of sessions) {
    session.playerSocks = []
    // connect players in batches to avoid a local SYN burst
    for (let i = 0; i < PLAYERS; i += 25) {
      const batch = players.slice(i, i + 25).map(async (player) => {
        const start = now()
        const sock = await connect(player, session.sessionId)
        joinLatencies.push(now() - start)
        return sock
      })
      session.playerSocks.push(...(await Promise.all(batch)))
    }
  }
  console.log(
    `Connected ${sessions.length} hosts + ${sessions.length * PLAYERS} players`,
  )

  // --- play: one question per session, all sessions at once -------------------
  const openLatencies = []
  const tStart = now()
  for (const session of sessions) {
    session.hostSock.ws.send(JSON.stringify({ type: 'START_GAME', payload: {} }))
    for (const sock of session.playerSocks) {
      openLatencies.push(
        sock
          .waitFor('SESSION_STATE', (s) => s.state === 'question_open')
          .then(() => now() - tStart),
      )
    }
  }
  const openTimes = await Promise.all(openLatencies)

  // grab question ids from the host's own state broadcast
  const answerTimes = (
    await Promise.all(
      sessions.map(async (session) => {
        const state = await session.hostSock.waitFor(
          'SESSION_STATE',
          (s) => s.state === 'question_open',
        )
        const questionId = state.question.id
        return Promise.all(
          session.playerSocks.map((sock) => {
            const start = now()
            sock.ws.send(
              JSON.stringify({
                type: 'ANSWER_QUESTION',
                payload: { questionId, answer: '4' },
              }),
            )
            return sock.waitFor('ANSWER_ACCEPTED').then(() => now() - start)
          }),
        )
      }),
    )
  ).flat()

  // reveal + winners
  const tReveal = now()
  const revealLatencies = []
  for (const session of sessions) {
    session.hostSock.ws.send(JSON.stringify({ type: 'SHOW_ANSWERS', payload: {} }))
    for (const sock of session.playerSocks) {
      revealLatencies.push(sock.waitFor('ANSWERS_REVEALED').then(() => now() - tReveal))
    }
  }
  const revealTimes = await Promise.all(revealLatencies)

  const tWinners = now()
  const endLatencies = []
  for (const session of sessions) {
    session.hostSock.ws.send(JSON.stringify({ type: 'SHOW_WINNERS', payload: {} }))
    for (const sock of session.playerSocks) {
      endLatencies.push(sock.waitFor('SESSION_ENDED').then(() => now() - tWinners))
    }
  }
  const endTimes = await Promise.all(endLatencies)

  for (const session of sessions) {
    session.hostSock.ws.close()
    for (const sock of session.playerSocks) sock.ws.close()
  }

  // --- report ----------------------------------------------------------------
  const totalMs = now() - t0
  const report = [
    stats('host join', [hostJoinMs]),
    stats('player join (connect+join)', joinLatencies),
    stats('question open broadcast', openTimes),
    stats('answer accepted', answerTimes),
    stats('answers revealed broadcast', revealTimes),
    stats('session ended broadcast', endTimes),
  ]
  console.log(`\nTotal wall time: ${(totalMs / 1000).toFixed(1)} s\n`)
  console.log('| phase | n | min | p50 | p95 | max |')
  console.log('|---|---|---|---|---|---|')
  for (const s of report) {
    console.log(`| ${s.name} | ${s.n} | ${s.min} ms | ${s.p50} ms | ${s.p95} ms | ${s.max} ms |`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
