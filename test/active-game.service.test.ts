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
      { id: 'q1', text: 'First?', img: null, order: 1, answers: [{ text: 'yes' }] },
      { id: 'q2', text: 'Second?', img: null, order: 2, answers: [{ text: 'no' }] },
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

const setup = (hostGraceSeconds = 300) => {
  const configStub = { get: () => ({ hostGraceSeconds }) }
  const service = new ActiveGameService(prismaStub as any, configStub as any)
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
  assert.equal(host.last('WINNERS')!.payload.standings[0].score, 2)
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
    { id: 'q1', text: 'Capital?', img: null, order: 1, answers: [{ text: 'Paris' }] },
    { id: 'q2', text: 'Tree?', img: null, order: 2, answers: [{ text: 'ёлка' }] },
    { id: 'q3', text: 'Two words?', img: null, order: 3, answers: [{ text: 'a b' }] },
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
})
