import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { WebSocket } from 'ws'
import { ActiveGameService, GameFault } from '../src/modules/active-game/active-game.service'

interface Sent {
  type: string
  payload: any
}

class FakeSocket {
  OPEN = 1
  readyState = 1
  sent: Sent[] = []
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  last(type: string): Sent | undefined {
    return [...this.sent].reverse().find((m) => m.type === type)
  }
  clear() {
    this.sent = []
  }
}

const prismaStub = {
  game: {
    findUnique: async ({ where: { id } }: any) =>
      id === 'game-1' ? { id, adminId: 'host-1', title: 'Geo quiz' } : null,
  },
  question: {
    findMany: async () => [
      {
        id: 'q1',
        text: 'First?',
        img: null,
        order: 1,
        timeLimitSec: 20,
        type: 'open',
        options: [],
        answers: [{ text: 'yes' }],
      },
      {
        id: 'q2',
        text: 'Second?',
        img: null,
        order: 2,
        timeLimitSec: 20,
        type: 'open',
        options: [],
        answers: [{ text: 'no' }],
      },
    ],
  },
  user: {
    findUnique: async ({ where: { id } }: any) => {
      if (id === 'host-1') return { id, name: 'Host' }
      if (id === 'player-1') return { id, name: 'Player' }
      return null
    },
  },
}

// tests that swap question.findMany must restore this afterwards
const defaultQuestionFindMany = prismaStub.question.findMany

const setup = (hostGraceSeconds = 300) => {
  const configStub = { getOrThrow: () => ({ hostGraceSeconds }) }
  const historyStub = {
    startRecord: async () => [] as string[],
    recordQuestionClosed: async () => {},
    finishRecord: async () => {},
  }
  const service = new ActiveGameService(prismaStub as any, configStub as any, historyStub as any)
  const host = new FakeSocket()
  const player = new FakeSocket()
  service.registerClient(host as unknown as WebSocket, 'host-1')
  service.registerClient(player as unknown as WebSocket, 'player-1')
  const fault = (fn: () => unknown): { code: string; message: string } => {
    try {
      const result = fn()
      if (result instanceof Promise) throw new Error('unexpected promise')
      throw new Error('expected GameFault')
    } catch (error) {
      assert.ok(error instanceof GameFault)
      return { code: error.code, message: error.message }
    }
  }
  const startSession = async () => {
    const { sessionId } = await service.createSession('game-1', 'host-1')
    await service.joinSession(host as unknown as WebSocket, sessionId)
    return sessionId
  }
  return { service, host, player, fault, startSession }
}

const openFirstQuestion = async (service: ActiveGameService, host: FakeSocket) => {
  const { sessionId } = await service.createSession('game-1', 'host-1')
  await service.joinSession(host as unknown as WebSocket, sessionId)
  service.startGame(host as unknown as WebSocket)
  return sessionId
}

test('session lifecycle: lobby -> questions -> winners -> finished', async () => {
  const { service, host, player, fault, startSession } = setup()
  const sessionId = await startSession()

  // lobby: players join, question is not shown yet
  const summary = service.getSessionSummary(sessionId)
  assert.equal(summary.state, 'lobby')
  assert.equal(summary.quizTitle, 'Geo quiz')
  assert.equal(summary.hostName, 'Host')
  await service.joinSession(player as unknown as WebSocket, sessionId)
  let state = host.last('SESSION_STATE')!.payload
  assert.equal(state.state, 'lobby')
  assert.equal(state.question, null)
  assert.equal(state.hostConnected, true)
  assert.equal(state.players.length, 1)

  // commands rejected in the wrong state
  fault(() => service.nextQuestion(host as unknown as WebSocket))
  fault(() => service.showAnswers(host as unknown as WebSocket))
  fault(() => service.showWinners(host as unknown as WebSocket))
  fault(() => service.answerQuestion(player as unknown as WebSocket, 'q1', 'yes'))

  service.startGame(host as unknown as WebSocket)
  state = host.last('SESSION_STATE')!.payload
  assert.equal(state.state, 'question_open')
  assert.equal(state.question.number, 1)
  assert.equal(state.question.total, 2)
  assert.equal(state.question.text, 'First?')

  // player answers; host cannot
  fault(() => service.answerQuestion(host as unknown as WebSocket, 'q1', 'yes'))
  service.answerQuestion(player as unknown as WebSocket, 'q1', ' yes ')
  const accepted = player.last('ANSWER_ACCEPTED')!.payload
  assert.equal(accepted.questionId, 'q1')

  // all online players answered -> auto close (BR-61)
  assert.equal(player.last('QUESTION_CLOSED')!.payload.questionId, 'q1')
  state = host.last('SESSION_STATE')!.payload
  assert.equal(state.state, 'question_closed')

  fault(() => service.answerQuestion(player as unknown as WebSocket, 'q1', 'yes'))
  service.showAnswers(host as unknown as WebSocket)
  const revealed = host.last('ANSWERS_REVEALED')!.payload
  assert.deepEqual(revealed.acceptedAnswers, ['yes'])
  assert.equal(revealed.answers[0].isCorrect, true)

  // next question in strict order only
  service.nextQuestion(host as unknown as WebSocket)
  state = host.last('SESSION_STATE')!.payload
  assert.equal(state.question.id, 'q2')
  service.answerQuestion(player as unknown as WebSocket, 'q2', 'no')
  service.showAnswers(host as unknown as WebSocket)

  // next past the last question is rejected; show winners instead
  fault(() => service.nextQuestion(host as unknown as WebSocket))
  service.showWinners(host as unknown as WebSocket)
  const win = host.last('WINNERS')!.payload.standings[0]
  assert.equal(win.place, 1)
  assert.equal(win.correctCount, 2)
  assert.ok(win.score > 0 && win.score <= 2000)
  assert.equal(host.last('SESSION_ENDED')!.payload.reason, 'finished')
  assert.equal(service.isSessionRunning('game-1'), false)

  // ended session: summary 410, re-join refused
  assert.throws(() => service.getSessionSummary(sessionId), /finished/)
  await assert.rejects(
    service.joinSession(player as unknown as WebSocket, sessionId),
    (e: GameFault) => e.code === 'NOT_FOUND',
  )
})

test('one session per quiz and per host; conflict returns the session id (BR-51)', async () => {
  const { service, startSession } = setup()
  const sessionId = await startSession()

  await assert.rejects(service.createSession('game-1', 'host-1'), (e: any) => {
    assert.equal(e.status, 409)
    assert.equal(e.response.sessionId, sessionId)
    return true
  })

  // the same host cannot drive a second quiz either
  prismaStub.game.findUnique = async ({ where: { id } }: any) => ({
    id,
    adminId: 'host-1',
    title: 'x',
  })
  await assert.rejects(service.createSession('game-2', 'host-1'), (e: any) => {
    assert.equal(e.response.sessionId, sessionId)
    return true
  })

  // a different user cannot start somebody else's game
  await assert.rejects(service.createSession('game-1', 'player-1'), (e: any) => e.status === 403)
})

test('quiz edits are blocked while the session runs (BR-54)', async () => {
  const { service, startSession } = setup()
  await startSession()
  assert.equal(service.isSessionRunning('game-1'), true)
  assert.throws(() => service.assertQuizEditable('game-1'), /live session/)
})

test('host disconnect starts a grace timer; host_timeout ends the room (BR-59)', async () => {
  const { service, host, player } = setup(0.05)
  const { sessionId } = await service.createSession('game-1', 'host-1')
  await service.joinSession(host as unknown as WebSocket, sessionId)
  await service.joinSession(player as unknown as WebSocket, sessionId)

  service.unregisterClient(host as unknown as WebSocket)
  let state = player.last('SESSION_STATE')!.payload
  assert.equal(state.hostConnected, false)
  assert.equal(service.isSessionRunning('game-1'), true)

  // the host came back in time
  service.registerClient(host as unknown as WebSocket, 'host-1')
  await service.joinSession(host as unknown as WebSocket, sessionId)
  state = player.last('SESSION_STATE')!.payload
  assert.equal(state.hostConnected, true)

  // left again and the grace expired -> SESSION_ENDED host_timeout
  service.unregisterClient(host as unknown as WebSocket)
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(player.last('SESSION_ENDED')!.payload.reason, 'host_timeout')
  assert.equal(service.isSessionRunning('game-1'), false)
  assert.throws(() => service.getSessionSummary(sessionId), /aborted/)
})

test('player reconnect keeps the answers (BR-58)', async () => {
  const { service, host, player } = setup()
  const sessionId = await openFirstQuestion(service, host)
  await service.joinSession(player as unknown as WebSocket, sessionId)
  service.answerQuestion(player as unknown as WebSocket, 'q1', 'yes')

  service.unregisterClient(player as unknown as WebSocket)
  let state = host.last('SESSION_STATE')!.payload
  assert.equal(state.players[0].connected, false)

  service.registerClient(player as unknown as WebSocket, 'player-1')
  await service.joinSession(player as unknown as WebSocket, sessionId)
  state = host.last('SESSION_STATE')!.payload
  assert.equal(state.players[0].connected, true)
  assert.equal(state.players[0].answered, true)

  // a second answer on the same question is still refused
  try {
    service.answerQuestion(player as unknown as WebSocket, 'q1', 'yes')
    assert.fail('expected GameFault')
  } catch (e) {
    assert.ok(e instanceof GameFault)
  }
})

test('rooms are isolated; endSession notifies only its own session', async () => {
  prismaStub.game.findUnique = async ({ where: { id } }: any) =>
    id === 'game-2'
      ? { id, adminId: 'host-2', title: 'Second' }
      : { id, adminId: 'host-1', title: 'x' }
  prismaStub.user.findUnique = async ({ where: { id } }: any) => ({
    id,
    name: id === 'host-2' ? 'Host2' : 'U',
  })

  const { service, player, startSession } = setup()
  const host2 = new FakeSocket()
  service.registerClient(host2 as unknown as WebSocket, 'host-2')
  const sessionId = await startSession()
  const other = await service.createSession('game-2', 'host-2')
  await service.joinSession(host2 as unknown as WebSocket, other.sessionId)
  await service.joinSession(player as unknown as WebSocket, sessionId)

  service.endSession(host2 as unknown as WebSocket)
  assert.equal(service.isSessionRunning('game-2'), false)
  assert.equal(service.isSessionRunning('game-1'), true)
  assert.equal(player.last('SESSION_ENDED'), undefined)
  assert.equal(host2.last('SESSION_ENDED')!.payload.reason, 'host_ended')
})

test('answers are compared after trim+lowercase normalization (BR-63, BR-64)', async () => {
  prismaStub.game.findUnique = async ({ where: { id } }: any) => ({
    id,
    adminId: 'host-1',
    title: 'x',
  })
  prismaStub.question.findMany = async () => [
    {
      id: 'q1',
      text: 'Capital?',
      img: null,
      order: 1,
      timeLimitSec: 20,
      type: 'open',
      options: [],
      answers: [{ text: 'Paris' }],
    },
    {
      id: 'q2',
      text: 'Tree?',
      img: null,
      order: 2,
      timeLimitSec: 20,
      type: 'open',
      options: [],
      answers: [{ text: 'ёлка' }],
    },
    {
      id: 'q3',
      text: 'Two words?',
      img: null,
      order: 3,
      timeLimitSec: 20,
      type: 'open',
      options: [],
      answers: [{ text: 'a b' }],
    },
  ]
  const { service, host, player, fault } = setup()
  const { sessionId } = await service.createSession('game-1', 'host-1')
  await service.joinSession(host as unknown as WebSocket, sessionId)
  await service.joinSession(player as unknown as WebSocket, sessionId)
  service.startGame(host as unknown as WebSocket)

  // BR-63: an answer that is blank after trimming is rejected
  fault(() => service.answerQuestion(player as unknown as WebSocket, 'q1', '   '))

  // BR-64: casing and surrounding whitespace are ignored
  service.answerQuestion(player as unknown as WebSocket, 'q1', '  PARIS ')
  // biome-ignore lint/complexity/useLiteralKeys: reaching into private state to verify stored answers
  const stored = service['rooms'].get(sessionId)!.players.get('player-1')!
  assert.equal(stored.answers[0].text, '  PARIS ')
  assert.equal(stored.answers[0].isCorrect, true)

  // the single online player answered, so the question auto-closed (BR-61)
  service.showAnswers(host as unknown as WebSocket)
  service.nextQuestion(host as unknown as WebSocket)

  // BR-64: ё and е are not folded together
  service.answerQuestion(player as unknown as WebSocket, 'q2', 'Елка')
  assert.equal(stored.answers[1].isCorrect, false)

  service.showAnswers(host as unknown as WebSocket)
  service.nextQuestion(host as unknown as WebSocket)

  // BR-64: inner whitespace is preserved
  service.answerQuestion(player as unknown as WebSocket, 'q3', 'a  b')
  assert.equal(stored.answers[2].isCorrect, false)

  prismaStub.question.findMany = defaultQuestionFindMany
})

test('scoreAnswer: BR-70 boundaries (t=0 -> 1000, t=T -> 500)', async () => {
  const { scoreAnswer } = await import('../src/modules/active-game/active-game.service')
  assert.equal(scoreAnswer(0, 20), 1000)
  assert.equal(scoreAnswer(-500, 20), 1000) // clock skew is clamped, not overpaid
  assert.equal(scoreAnswer(10_000, 20), 750) // half of the time -> 750
  assert.equal(scoreAnswer(20_000, 20), 500)
  assert.equal(scoreAnswer(25_000, 20), 500) // beyond the limit stays at the floor
})

test('points are stored and revealed; a late answer is rejected (BR-62, BR-70)', async () => {
  const realNow = Date.now
  try {
    const t0 = 1_000_000
    Date.now = () => t0
    const { service, host, player, fault } = setup()
    const { sessionId } = await service.createSession('game-1', 'host-1')
    await service.joinSession(host as unknown as WebSocket, sessionId)
    await service.joinSession(player as unknown as WebSocket, sessionId)
    service.startGame(host as unknown as WebSocket)

    Date.now = () => t0 + 2000 // answers 2 s in on a 20 s question
    service.answerQuestion(player as unknown as WebSocket, 'q1', 'yes')
    // biome-ignore lint/complexity/useLiteralKeys: reaching into private state to verify scoring
    const stored = service['rooms'].get(sessionId)!.players.get('player-1')!
    assert.equal(stored.answers[0].responseTimeMs, 2000)
    assert.equal(stored.answers[0].points, 950) // 1000 * (1 - 2000/40000)

    // the question auto-closed; the reveal carries the points
    service.showAnswers(host as unknown as WebSocket)
    const revealed = player.last('ANSWERS_REVEALED')!.payload
    assert.equal(revealed.answers[0].points, 950)

    Date.now = () => t0 + 5000
    service.nextQuestion(host as unknown as WebSocket)

    // an answer stamped after questionEndsAt is refused (BR-62)
    Date.now = () => t0 + 5000 + 20_000 + 1
    const { code } = fault(() => service.answerQuestion(player as unknown as WebSocket, 'q2', 'no'))
    assert.equal(code, 'BAD_REQUEST')
  } finally {
    Date.now = realNow
  }
})

test('the question timer auto-closes and SESSION_STATE carries endsAt + serverNow', async () => {
  prismaStub.question.findMany = async () => [
    {
      id: 'q1',
      text: 'Fast?',
      img: null,
      order: 1,
      timeLimitSec: 1,
      type: 'open',
      options: [],
      answers: [{ text: 'yes' }],
    },
    {
      id: 'q2',
      text: 'Second?',
      img: null,
      order: 2,
      timeLimitSec: 20,
      type: 'open',
      options: [],
      answers: [{ text: 'no' }],
    },
  ]
  const { service, host, player } = setup()
  const { sessionId } = await service.createSession('game-1', 'host-1')
  await service.joinSession(host as unknown as WebSocket, sessionId)
  await service.joinSession(player as unknown as WebSocket, sessionId)
  service.startGame(host as unknown as WebSocket)

  const state = player.last('SESSION_STATE')!.payload
  assert.ok(state.question.endsAt > state.serverNow)
  assert.ok(state.question.endsAt - state.serverNow <= 1000)

  await new Promise((resolve) => setTimeout(resolve, 1200))
  assert.equal(player.last('QUESTION_CLOSED')!.payload.questionId, 'q1')
  assert.equal(player.last('SESSION_STATE')!.payload.state, 'question_closed')

  prismaStub.question.findMany = defaultQuestionFindMany
})

test('standings: score desc, then total correct time asc (BR-72)', async () => {
  const realNow = Date.now
  try {
    const t0 = 1_000_000
    Date.now = () => t0
    const { service, host, player } = setup()
    const p2 = new FakeSocket()
    service.registerClient(p2 as unknown as WebSocket, 'player-2')
    const { sessionId } = await service.createSession('game-1', 'host-1')
    await service.joinSession(host as unknown as WebSocket, sessionId)
    await service.joinSession(player as unknown as WebSocket, sessionId)
    await service.joinSession(p2 as unknown as WebSocket, sessionId)
    service.startGame(host as unknown as WebSocket)

    // both are right on q1: player-1 is faster
    Date.now = () => t0 + 1000
    service.answerQuestion(player as unknown as WebSocket, 'q1', 'yes')
    Date.now = () => t0 + 4000
    service.answerQuestion(p2 as unknown as WebSocket, 'q1', 'yes')
    service.showAnswers(host as unknown as WebSocket)
    service.nextQuestion(host as unknown as WebSocket)

    // q2 opens "now" (t0 + 4000): both answer 1 s in — equal points, but
    // player-1's total correct time is still lower
    Date.now = () => t0 + 5000
    service.answerQuestion(player as unknown as WebSocket, 'q2', 'no')
    service.answerQuestion(p2 as unknown as WebSocket, 'q2', 'no')
    service.showAnswers(host as unknown as WebSocket)
    service.showWinners(host as unknown as WebSocket)

    const standings = host.last('WINNERS')!.payload.standings
    assert.deepEqual(
      standings.map((s: any) => [s.place, s.id, s.score, s.correctCount]),
      [
        [1, 'player-1', 1950, 2], // 975 + 975 — faster on q1
        [2, 'player-2', 1875, 2], // 900 + 975
      ],
    )
  } finally {
    Date.now = realNow
  }
})

test('standings: a full tie shares the place (BR-73)', async () => {
  const realNow = Date.now
  try {
    const t0 = 1_000_000
    Date.now = () => t0
    const { service, host, player } = setup()
    const p2 = new FakeSocket()
    service.registerClient(p2 as unknown as WebSocket, 'player-2')
    const { sessionId } = await service.createSession('game-1', 'host-1')
    await service.joinSession(host as unknown as WebSocket, sessionId)
    await service.joinSession(player as unknown as WebSocket, sessionId)
    await service.joinSession(p2 as unknown as WebSocket, sessionId)
    service.startGame(host as unknown as WebSocket)

    // identical response times -> identical points and identical tie-break
    Date.now = () => t0 + 2000
    service.answerQuestion(player as unknown as WebSocket, 'q1', 'yes')
    service.answerQuestion(p2 as unknown as WebSocket, 'q1', 'yes')
    service.showAnswers(host as unknown as WebSocket)
    service.nextQuestion(host as unknown as WebSocket)

    Date.now = () => t0 + 4000 // q2 opened at t0 + 2000 -> 2 s in again
    service.answerQuestion(player as unknown as WebSocket, 'q2', 'no')
    service.answerQuestion(p2 as unknown as WebSocket, 'q2', 'no')
    service.showAnswers(host as unknown as WebSocket)
    service.showWinners(host as unknown as WebSocket)

    const standings = host.last('WINNERS')!.payload.standings
    assert.deepEqual(
      standings.map((s: any) => s.place),
      [1, 1],
    )
    assert.equal(standings[0].score, standings[1].score)
  } finally {
    Date.now = realNow
  }
})

test('the session records its history: start, each closed question, and the end (BR-80, NFR-R6)', async () => {
  const calls: { method: string; input: any }[] = []
  const historyStub = {
    startRecord: async (input: any) => {
      calls.push({ method: 'startRecord', input })
      return input.questions.map((_: any, i: number) => `sq${i + 1}`)
    },
    recordQuestionClosed: async (input: any) => {
      calls.push({ method: 'recordQuestionClosed', input })
    },
    finishRecord: async (input: any) => {
      calls.push({ method: 'finishRecord', input })
    },
  }
  const configStub = { getOrThrow: () => ({ hostGraceSeconds: 300 }) }
  const service = new ActiveGameService(prismaStub as any, configStub as any, historyStub as any)
  const host = new FakeSocket()
  const player = new FakeSocket()
  service.registerClient(host as unknown as WebSocket, 'host-1')
  service.registerClient(player as unknown as WebSocket, 'player-1')

  const { sessionId } = await service.createSession('game-1', 'host-1')
  assert.equal(calls[0].method, 'startRecord')
  assert.equal(calls[0].input.sessionId, sessionId)
  assert.deepEqual(
    calls[0].input.questions.map((q: any) => [q.position, q.acceptedAnswers]),
    [
      [1, ['yes']],
      [2, ['no']],
    ],
  )

  await service.joinSession(host as unknown as WebSocket, sessionId)
  await service.joinSession(player as unknown as WebSocket, sessionId)
  service.startGame(host as unknown as WebSocket)
  service.answerQuestion(player as unknown as WebSocket, 'q1', 'yes')

  const closed = calls.find((c) => c.method === 'recordQuestionClosed')!
  assert.equal(closed.input.sessionQuestionId, 'sq1')
  assert.equal(closed.input.answers.length, 1)
  assert.equal(closed.input.answers[0].isCorrect, true)
  assert.equal(closed.input.players.length, 1)

  service.showAnswers(host as unknown as WebSocket)
  service.nextQuestion(host as unknown as WebSocket)
  service.answerQuestion(player as unknown as WebSocket, 'q2', 'no')
  service.showAnswers(host as unknown as WebSocket)
  service.showWinners(host as unknown as WebSocket)

  const finished = calls.find((c) => c.method === 'finishRecord')!
  assert.equal(finished.input.status, 'finished')
  assert.deepEqual(
    finished.input.players.map((p: any) => [p.userId, p.place, p.correctCount]),
    [['player-1', 1, 2]],
  )
})

test('a host-ended session is recorded as aborted (BR-80)', async () => {
  const calls: { method: string; input: any }[] = []
  const historyStub = {
    startRecord: async () => ['sq1', 'sq2'],
    recordQuestionClosed: async (input: any) => {
      calls.push({ method: 'recordQuestionClosed', input })
    },
    finishRecord: async (input: any) => {
      calls.push({ method: 'finishRecord', input })
    },
  }
  const service = new ActiveGameService(
    prismaStub as any,
    { getOrThrow: () => ({ hostGraceSeconds: 300 }) } as any,
    historyStub as any,
  )
  const host = new FakeSocket()
  service.registerClient(host as unknown as WebSocket, 'host-1')
  const { sessionId } = await service.createSession('game-1', 'host-1')
  await service.joinSession(host as unknown as WebSocket, sessionId)
  service.endSession(host as unknown as WebSocket)

  const finished = calls.find((c) => c.method === 'finishRecord')!
  assert.equal(finished.input.status, 'aborted')
})

const choiceQuiz = () => {
  prismaStub.question.findMany = async () => [
    {
      id: 'q1',
      text: 'Pick a color?',
      img: null,
      order: 1,
      timeLimitSec: 20,
      type: 'choice',
      options: [
        { id: 'o1', text: 'red', isCorrect: false },
        { id: 'o2', text: 'blue', isCorrect: true },
        { id: 'o3', text: 'yellow', isCorrect: false },
      ],
      answers: [],
    },
    {
      id: 'q2',
      text: 'Open?',
      img: null,
      order: 2,
      timeLimitSec: 20,
      type: 'open',
      options: [],
      answers: [{ text: 'yes' }],
    },
  ]
}

test('choice questions: options broadcast without isCorrect, answers by optionId (BR-87, BR-88)', async () => {
  choiceQuiz()
  try {
    const { service, host, player, fault } = setup()
    const { sessionId } = await service.createSession('game-1', 'host-1')
    await service.joinSession(host as unknown as WebSocket, sessionId)
    await service.joinSession(player as unknown as WebSocket, sessionId)
    service.startGame(host as unknown as WebSocket)

    // BR-88: option texts reach the clients during the question, isCorrect does not
    const state = player.last('SESSION_STATE')!.payload
    assert.equal(state.question.type, 'choice')
    assert.deepEqual(state.question.options, [
      { id: 'o1', text: 'red' },
      { id: 'o2', text: 'blue' },
      { id: 'o3', text: 'yellow' },
    ])

    // an unknown option id is refused before it can count as an answer
    const { code } = fault(() =>
      service.answerQuestion(player as unknown as WebSocket, 'q1', undefined, 'nope'),
    )
    assert.equal(code, 'BAD_REQUEST')

    service.answerQuestion(player as unknown as WebSocket, 'q1', undefined, 'o2')
    const accepted = player.last('ANSWER_ACCEPTED')!.payload
    assert.deepEqual(accepted, { questionId: 'q1', optionId: 'o2', text: 'blue' })

    // the second pick is refused; the first one counts (BR-63)
    fault(() => service.answerQuestion(player as unknown as WebSocket, 'q1', undefined, 'o1'))

    service.showAnswers(host as unknown as WebSocket)
    const revealed = player.last('ANSWERS_REVEALED')!.payload
    assert.equal(revealed.correctOptionId, 'o2')
    assert.equal(revealed.answers[0].optionId, 'o2')
    assert.equal(revealed.answers[0].text, 'blue')
    assert.equal(revealed.answers[0].isCorrect, true)
    assert.ok(revealed.answers[0].points >= 500 && revealed.answers[0].points <= 1000)

    // the mixed quiz continues into an open question unchanged
    service.nextQuestion(host as unknown as WebSocket)
    service.answerQuestion(player as unknown as WebSocket, 'q2', 'yes')
    service.showAnswers(host as unknown as WebSocket)
    const openRevealed = player.last('ANSWERS_REVEALED')!.payload
    assert.deepEqual(openRevealed.acceptedAnswers, ['yes'])
    assert.ok(!('optionId' in openRevealed.answers[0]))
    assert.ok(!('correctOptionId' in openRevealed))
  } finally {
    prismaStub.question.findMany = defaultQuestionFindMany
  }
})

test('a wrong option pick is incorrect and scores 0 (BR-87, BR-70)', async () => {
  choiceQuiz()
  try {
    const { service, host, player } = setup()
    const { sessionId } = await service.createSession('game-1', 'host-1')
    await service.joinSession(host as unknown as WebSocket, sessionId)
    await service.joinSession(player as unknown as WebSocket, sessionId)
    service.startGame(host as unknown as WebSocket)

    service.answerQuestion(player as unknown as WebSocket, 'q1', undefined, 'o1')
    // biome-ignore lint/complexity/useLiteralKeys: reaching into private state to verify stored answers
    const stored = service['rooms'].get(sessionId)!.players.get('player-1')!
    assert.equal(stored.answers[0].optionId, 'o1')
    assert.equal(stored.answers[0].isCorrect, false)
    assert.equal(stored.answers[0].points, 0)

    service.showAnswers(host as unknown as WebSocket)
    const revealed = player.last('ANSWERS_REVEALED')!.payload
    assert.equal(revealed.answers[0].optionId, 'o1')
    assert.equal(revealed.answers[0].isCorrect, false)
  } finally {
    prismaStub.question.findMany = defaultQuestionFindMany
  }
})

test('a reconnecting player gets the optionId echo (BR-58)', async () => {
  choiceQuiz()
  try {
    const { service, host, player } = setup()
    const { sessionId } = await service.createSession('game-1', 'host-1')
    await service.joinSession(host as unknown as WebSocket, sessionId)
    await service.joinSession(player as unknown as WebSocket, sessionId)
    service.startGame(host as unknown as WebSocket)
    service.answerQuestion(player as unknown as WebSocket, 'q1', undefined, 'o2')

    service.unregisterClient(player as unknown as WebSocket)
    player.clear()
    service.registerClient(player as unknown as WebSocket, 'player-1')
    await service.joinSession(player as unknown as WebSocket, sessionId)
    const echo = player.last('ANSWER_ACCEPTED')!.payload
    assert.deepEqual(echo, { questionId: 'q1', optionId: 'o2', text: 'blue' })
  } finally {
    prismaStub.question.findMany = defaultQuestionFindMany
  }
})

test('a quiz with an invalid choice question cannot start (D-15)', async () => {
  prismaStub.question.findMany = async () => [
    {
      id: 'q1',
      text: 'Pick?',
      img: null,
      order: 1,
      timeLimitSec: 20,
      type: 'choice',
      options: [{ id: 'o1', text: 'lonely', isCorrect: true }],
      answers: [],
    },
    {
      id: 'q2',
      text: 'No correct',
      img: null,
      order: 2,
      timeLimitSec: 20,
      type: 'choice',
      options: [
        { id: 'o1', text: 'a', isCorrect: false },
        { id: 'o2', text: 'b', isCorrect: false },
      ],
      answers: [],
    },
  ]
  try {
    const { service } = setup()
    await assert.rejects(service.createSession('game-1', 'host-1'), /not ready/)
  } finally {
    prismaStub.question.findMany = defaultQuestionFindMany
  }
})
