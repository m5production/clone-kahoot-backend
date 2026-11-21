import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HistoryService } from '../src/modules/history/history.service'

/** in-memory stand-in for the history tables */
const store = {
  sessions: [] as any[],
  questions: [] as any[],
  players: [] as any[],
  answers: [] as any[],
  nextId: 1,
}

const prismaStub = {
  gameSession: {
    create: async ({ data, include }: any) => {
      const session = {
        ...data,
        status: 'running',
        startedAt: new Date(),
        endedAt: null,
        questions: [],
      }
      store.sessions.push(session)
      for (const q of data.questions.create) {
        const row = { ...q, id: `sq${store.nextId++}`, sessionId: session.id }
        store.questions.push(row)
        if (include?.questions) session.questions.push(row)
      }
      return session
    },
    findMany: async ({ where, include }: any) =>
      store.sessions
        .filter(
          (s) =>
            s.hostId === where.hostId &&
            (!('gameId' in where) || s.gameId === where.gameId) &&
            (!where.status?.not || s.status !== where.status.not),
        )
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
        .map((s) =>
          include?.players
            ? { ...s, players: store.players.filter((p) => p.sessionId === s.id) }
            : s,
        ),
    findUnique: async ({ where, include }: any) => {
      const session = store.sessions.find((s) => s.id === where.id)
      if (!session || !include) return session ?? null
      return {
        ...session,
        players: store.players
          .filter((p) => p.sessionId === session.id)
          .map((p) => ({
            ...p,
            answers: store.answers.filter((a) => a.sessionPlayerId === p.id),
          })),
        questions: store.questions
          .filter((q) => q.sessionId === session.id)
          .sort((a, b) => a.position - b.position),
      }
    },
    updateMany: async ({ where, data }: any) => {
      const matches = where.id
        ? store.sessions.filter((s) => s.id === where.id)
        : store.sessions.filter((s) => s.status === where.status)
      for (const s of matches) Object.assign(s, data)
      return { count: matches.length }
    },
    delete: async ({ where }: any) => {
      store.sessions = store.sessions.filter((s) => s.id !== where.id)
      store.questions = store.questions.filter((q) => q.sessionId !== where.id)
      store.players = store.players.filter((p) => p.sessionId !== where.id)
    },
  },
  sessionPlayer: {
    upsert: async ({ where, create, update }: any) => {
      let row = store.players.find(
        (p) =>
          p.sessionId === where.sessionId_userId.sessionId &&
          p.userId === where.sessionId_userId.userId,
      )
      if (row) {
        Object.assign(row, update)
      } else {
        row = { ...create, id: `sp${store.nextId++}` }
        store.players.push(row)
      }
      return row
    },
  },
  sessionAnswer: {
    upsert: async ({ where, create }: any) => {
      let row = store.answers.find(
        (a) =>
          a.sessionPlayerId === where.sessionPlayerId_sessionQuestionId.sessionPlayerId &&
          a.sessionQuestionId === where.sessionPlayerId_sessionQuestionId.sessionQuestionId,
      )
      if (!row) {
        row = { ...create, id: `sa${store.nextId++}` }
        store.answers.push(row)
      }
      return row
    },
  },
}

const reset = () => {
  store.sessions = []
  store.questions = []
  store.players = []
  store.answers = []
  store.nextId = 1
}

const service = () => new HistoryService(prismaStub as any)

test('startRecord writes the session and a question snapshot in order (BR-80)', async () => {
  reset()
  const ids = await service().startRecord({
    sessionId: 's1',
    gameId: 'g1',
    hostId: 'h1',
    quizTitle: 'Geo quiz',
    questions: [
      { position: 1, text: 'Q1?', img: null, timeLimitSec: 20, acceptedAnswers: ['yes'] },
      {
        position: 2,
        text: 'Q2?',
        img: 'http://img',
        timeLimitSec: 60,
        acceptedAnswers: ['a', 'b'],
      },
    ],
  })

  assert.equal(store.sessions[0].status, 'running')
  assert.deepEqual(ids, ['sq1', 'sq2'])
  assert.equal(store.questions[1].timeLimitSec, 60)
  assert.deepEqual(store.questions[1].acceptedAnswers, ['a', 'b'])
})

test('recordQuestionClosed upserts players and stores the answers (NFR-R6)', async () => {
  reset()
  const [sq1] = await service().startRecord({
    sessionId: 's1',
    gameId: 'g1',
    hostId: 'h1',
    quizTitle: 'Geo',
    questions: [
      { position: 1, text: 'Q1?', img: null, timeLimitSec: 20, acceptedAnswers: ['yes'] },
    ],
  })
  const record = {
    sessionId: 's1',
    sessionQuestionId: sq1,
    players: [
      {
        userId: 'u1',
        nickname: 'Ann',
        color: 'red',
        score: 950,
        correctCount: 1,
        correctTimeMs: 2000,
      },
      { userId: 'u2', nickname: 'Bob', color: 'blue', score: 0, correctCount: 0, correctTimeMs: 0 },
    ],
    answers: [
      { userId: 'u1', text: 'yes', isCorrect: true, responseTimeMs: 2000, points: 950 },
      { userId: 'u2', text: 'no', isCorrect: false, responseTimeMs: 3000, points: 0 },
    ],
  }
  await service().recordQuestionClosed(record)
  // a second close of the same question (reconnect race) keeps one answer row
  await service().recordQuestionClosed(record)

  assert.equal(store.players.length, 2)
  assert.equal(store.answers.length, 2)
  assert.equal(store.answers[0].points, 950)
  assert.equal(store.answers[1].isCorrect, false)
})

test('finishRecord sets the status, the end time and the places (BR-80)', async () => {
  reset()
  await service().startRecord({
    sessionId: 's1',
    gameId: 'g1',
    hostId: 'h1',
    quizTitle: 'Geo',
    questions: [{ position: 1, text: 'Q?', img: null, timeLimitSec: 20, acceptedAnswers: ['x'] }],
  })
  await service().finishRecord({
    sessionId: 's1',
    status: 'finished',
    players: [
      {
        userId: 'u1',
        nickname: 'Ann',
        color: 'red',
        score: 1950,
        correctCount: 2,
        correctTimeMs: 3000,
        place: 1,
      },
      {
        userId: 'u2',
        nickname: 'Bob',
        color: 'blue',
        score: 500,
        correctCount: 1,
        correctTimeMs: 9000,
        place: 2,
      },
    ],
  })

  assert.equal(store.sessions[0].status, 'finished')
  assert.ok(store.sessions[0].endedAt)
  assert.equal(store.players.find((p) => p.userId === 'u1').place, 1)
})

test('onModuleInit sweeps stale running rows to aborted (NFR-R7)', async () => {
  reset()
  await service().startRecord({
    sessionId: 's1',
    gameId: 'g1',
    hostId: 'h1',
    quizTitle: 'Geo',
    questions: [],
  })
  await service().onModuleInit()
  assert.equal(store.sessions[0].status, 'aborted')
  assert.ok(store.sessions[0].endedAt)
})

test('listHistory returns own finished sessions newest first with a winner (FR-80)', async () => {
  reset()
  for (const [id, hostId, status] of [
    ['s-old', 'h1', 'finished'],
    ['s-new', 'h1', 'aborted'],
    ['s-other', 'h2', 'finished'],
    ['s-live', 'h1', 'running'],
  ] as const) {
    await service().startRecord({
      sessionId: id,
      gameId: 'g1',
      hostId,
      quizTitle: id,
      questions: [],
    })
    store.sessions.at(-1).status = status
  }
  store.sessions[0].startedAt = new Date('2026-01-01')
  store.sessions[1].startedAt = new Date('2026-02-01')
  for (const player of [
    {
      sessionId: 's-new',
      userId: 'u1',
      nickname: 'Ann',
      color: 'r',
      score: 100,
      correctCount: 1,
      correctTimeMs: 1,
      place: 1,
    },
    {
      sessionId: 's-new',
      userId: 'u2',
      nickname: 'Bob',
      color: 'b',
      score: 50,
      correctCount: 0,
      correctTimeMs: 0,
      place: 2,
    },
  ]) {
    store.players.push({ ...player, id: `sp${store.nextId++}` })
  }

  const list = await service().listHistory('h1')
  assert.deepEqual(
    list.map((e) => e.id),
    ['s-new', 's-old'],
  )
  assert.equal(list[0].status, 'aborted')
  assert.equal(list[0].playerCount, 2)
  assert.deepEqual(list[0].winner, { name: 'Ann', score: 100 })
  assert.equal(list[1].winner, null)

  // FR-83: a gameId filter narrows the list
  assert.equal((await service().listHistory('h1', 'other-game')).length, 0)
})

test('getReport gives the host standings and per-question answers (FR-81, BR-81)', async () => {
  reset()
  const [sq1] = await service().startRecord({
    sessionId: 's1',
    gameId: 'g1',
    hostId: 'h1',
    quizTitle: 'Geo',
    questions: [
      { position: 1, text: 'Q1?', img: null, timeLimitSec: 20, acceptedAnswers: ['yes'] },
      { position: 2, text: 'Q2?', img: null, timeLimitSec: 30, acceptedAnswers: ['no'] },
    ],
  })
  const svc = service()
  await svc.recordQuestionClosed({
    sessionId: 's1',
    sessionQuestionId: sq1,
    players: [
      {
        userId: 'u1',
        nickname: 'Ann',
        color: 'red',
        score: 950,
        correctCount: 1,
        correctTimeMs: 2000,
      },
    ],
    answers: [{ userId: 'u1', text: 'yes', isCorrect: true, responseTimeMs: 2000, points: 950 }],
  })
  await svc.finishRecord({
    sessionId: 's1',
    status: 'finished',
    players: [
      {
        userId: 'u1',
        nickname: 'Ann',
        color: 'red',
        score: 950,
        correctCount: 1,
        correctTimeMs: 2000,
        place: 1,
      },
    ],
  })

  const report = await svc.getReport('s1', 'h1')
  assert.equal(report.status, 'finished')
  assert.deepEqual(report.standings, [
    { place: 1, userId: 'u1', nickname: 'Ann', score: 950, correctCount: 1 },
  ])
  assert.equal(report.questions.length, 2)
  assert.equal(report.questions[0].acceptedAnswers[0], 'yes')
  assert.equal(report.questions[0].answers[0].points, 950)
  // the unanswered question still reports a row for every player
  assert.equal(report.questions[1].answers[0].text, null)
  assert.equal(report.questions[1].answers[0].responseTimeMs, null)

  // a foreign host gets the same 404 as a missing record (BR-81)
  await assert.rejects(svc.getReport('s1', 'h2'), /No such session record/)
})

test('deleteRecord removes own finished records only (FR-82, BR-82)', async () => {
  reset()
  const svc = service()
  await svc.startRecord({
    sessionId: 's1',
    gameId: 'g1',
    hostId: 'h1',
    quizTitle: 'Geo',
    questions: [],
  })

  // a live session is not history yet
  await assert.rejects(svc.deleteRecord('s1', 'h1'), /still live/)

  store.sessions[0].status = 'finished'
  await assert.rejects(svc.deleteRecord('s1', 'h2'), /No such session record/)

  await svc.deleteRecord('s1', 'h1')
  assert.equal(store.sessions.length, 0)
  await assert.rejects(svc.deleteRecord('s1', 'h1'), /No such session record/)
})
