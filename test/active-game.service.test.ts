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
      id === 'game-1' ? { id, adminId: 'host-1' } : null,
  },
  question: {
    findMany: async () => [
      { id: 'q1', text: 'First?', img: null, order: 1, answers: [{ text: 'yes' }] },
      { id: 'q2', text: 'Second?', img: null, order: 2, answers: [{ text: 'no' }] },
    ],
  },
  user: {
    findUnique: async ({ where: { id } }: any) =>
      id === 'player-1' ? { id, name: 'Player' } : null,
  },
}

const setup = () => {
  const service = new ActiveGameService(prismaStub as any)
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
  return { service, host, player, fault }
}

test('only the owner can start a game and only once', async () => {
  const { service, host, player } = setup()
  await assert.rejects(
    service.startGame(player as unknown as WebSocket, 'game-1'),
    (e: GameFault) => e.code === 'FORBIDDEN',
  )
  await service.startGame(host as unknown as WebSocket, 'game-1')
  const data = host.last('GAME_DATA')!.payload
  assert.equal(data.id, 'game-1')
  assert.equal(data.activeQuestionId, 'q1')
  assert.deepEqual(
    data.allQuestions.map((q: any) => q.id),
    ['q1', 'q2'],
  )
  await assert.rejects(
    service.startGame(host as unknown as WebSocket, 'game-1'),
    (e: GameFault) => e.code === 'ALREADY_RUNNING',
  )
  assert.ok(service.isGameRunning('game-1'))
})

test('player joins, answers once, host disconnect ends the room', async () => {
  const { service, host, player, fault } = setup()
  await service.startGame(host as unknown as WebSocket, 'game-1')
  await service.joinGame(player as unknown as WebSocket, 'game-1')

  const gameData = host.last('GAME_DATA')!.payload
  assert.equal(gameData.players.length, 1)
  assert.equal(gameData.players[0].name, 'Player')
  // no answer texts or correctness may leak in GAME_DATA
  assert.equal(JSON.stringify(gameData).includes('yes'), false)

  // host cannot answer
  fault(() => service.answerQuestion(host as unknown as WebSocket, 'q1', 'yes'))
  // player cannot answer non-active question
  fault(() => service.answerQuestion(player as unknown as WebSocket, 'q2', 'no'))

  player.clear()
  service.answerQuestion(player as unknown as WebSocket, 'q1', 'yes')
  const stored = service['rooms'].get('game-1')!.players.get('player-1')!
  assert.equal(stored.answers[0].isCorrect, true)

  fault(() => service.answerQuestion(player as unknown as WebSocket, 'q1', 'yes')) // repeat

  // player cannot drive the game
  fault(() => service.changeQuestion(player as unknown as WebSocket, 'q2'))
  fault(() => service.endGame(player as unknown as WebSocket))

  service.showAnswers(host as unknown as WebSocket, 'q1')
  const revealed = host.last('SHOW_ANSWERS')!.payload
  assert.equal(revealed.answers[0].playerAnswer.isCorrect, true)

  service.showWinners(host as unknown as WebSocket)
  assert.equal(host.last('SHOW_WINNERS')!.payload.standings[0].score, 1)

  // player disconnect keeps answers for reconnect (new connection = new client registration)
  service.unregisterClient(player as unknown as WebSocket)
  assert.equal(stored.connected, false)
  service.registerClient(player as unknown as WebSocket, 'player-1')
  await service.joinGame(player as unknown as WebSocket, 'game-1')
  assert.equal(stored.answers.length, 1)

  // host disconnect ends the room
  service.unregisterClient(host as unknown as WebSocket)
  assert.equal(service.isGameRunning('game-1'), false)
  assert.equal(player.last('END_GAME')?.type, 'END_GAME')
})

test('second room is isolated from the first', async () => {
  prismaStub.game.findUnique = async ({ where: { id } }: any) =>
    id === 'game-1' || id === 'game-2' ? { id, adminId: 'host-1' } : null
  const { service, host, player } = setup()
  const host2 = new FakeSocket()
  const player2 = new FakeSocket()
  service.registerClient(host2 as unknown as WebSocket, 'host-1')
  service.registerClient(player2 as unknown as WebSocket, 'player-1')

  await service.startGame(host as unknown as WebSocket, 'game-1')
  await service.startGame(host2 as unknown as WebSocket, 'game-2')
  await service.joinGame(player as unknown as WebSocket, 'game-1')

  // player of room 1 sending to room 2's game is impossible: answers scoped by room
  service.endGame(host2 as unknown as WebSocket)
  assert.equal(service.isGameRunning('game-2'), false)
  assert.equal(service.isGameRunning('game-1'), true)
  // room 1 was not notified
  assert.equal(player.last('END_GAME'), undefined)
})
