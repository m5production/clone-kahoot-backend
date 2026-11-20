import { Injectable, Logger } from '@nestjs/common'
import type { WebSocket } from 'ws'
import { normalizeAnswer } from '../../common/normalize-answer'
import { PrismaService } from '../../database/prisma.service'

export const GAME_COLORS = ['red', 'orange', 'blue', 'green', 'purple', 'pink']

export type Role = 'host' | 'player'

interface PlayerState {
  id: string
  name: string
  bgColor: string
  answers: { questionId: string; text: string; isCorrect: boolean }[]
  connected: boolean
}

export interface PublicGameData {
  id: string
  players: {
    id: string
    name: string
    bgColor: string
    answers: { questionId: string }[]
    connected: boolean
  }[]
  allQuestions: { id: string; text: string; img: string | null }[]
  activeQuestionId: string | null
}

interface Room {
  gameId: string
  hostSocket: WebSocket
  hostUserId: string
  questions: { id: string; text: string; img: string | null }[]
  acceptedAnswers: Map<string, Set<string>>
  activeQuestionId: string | null
  players: Map<string, PlayerState>
  sockets: Map<WebSocket, { userId: string; role: Role }>
}

export class GameFault extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

@Injectable()
export class ActiveGameService {
  private readonly logger = new Logger(ActiveGameService.name)
  private readonly rooms = new Map<string, Room>()
  private readonly clientMeta = new Map<WebSocket, { userId: string; roomId: string | null }>()

  constructor(private readonly prisma: PrismaService) {}

  registerClient(socket: WebSocket, userId: string): void {
    this.clientMeta.set(socket, { userId, roomId: null })
  }

  unregisterClient(socket: WebSocket): void {
    const meta = this.clientMeta.get(socket)
    this.clientMeta.delete(socket)
    if (!meta?.roomId) return
    const room = this.rooms.get(meta.roomId)
    if (!room) return
    const info = room.sockets.get(socket)
    room.sockets.delete(socket)
    if (info?.role === 'host' && room.hostSocket === socket) {
      this.endRoom(meta.roomId)
      return
    }
    const userId = info?.userId
    const player = userId ? room.players.get(userId) : undefined
    if (player && ![...room.sockets.values()].some((s) => s.userId === userId)) {
      player.connected = false
    }
    this.broadcastGameData(room)
  }

  isGameRunning(gameId: string): boolean {
    return this.rooms.has(gameId)
  }

  async startGame(socket: WebSocket, gameId: string): Promise<void> {
    const meta = this.requireMeta(socket)
    if (this.rooms.has(gameId)) {
      throw new GameFault('ALREADY_RUNNING', 'The game is already running')
    }
    const game = await this.prisma.game.findUnique({ where: { id: gameId } })
    if (!game) throw new GameFault('NOT_FOUND', `Game with id ${gameId} was not found`)
    if (game.adminId !== meta.userId) {
      throw new GameFault('FORBIDDEN', 'Only the game owner can start it')
    }
    const questions = await this.prisma.question.findMany({
      where: { gameId },
      orderBy: { order: 'asc' },
      include: { answers: true },
    })
    // BR-49: a quiz is launchable only when every question has text and answers
    const quizNotReady =
      questions.length === 0 || questions.some((q) => !q.text.trim() || q.answers.length === 0)
    if (quizNotReady) {
      throw new GameFault(
        'BAD_REQUEST',
        'The quiz is not ready: every question needs text and at least one accepted answer',
      )
    }
    const room: Room = {
      gameId,
      hostSocket: socket,
      hostUserId: meta.userId,
      questions: questions.map(({ id, text, img }) => ({ id, text, img })),
      // BR-64: accepted answers are stored normalized so casing/outer
      // whitespace of a player's answer does not matter
      acceptedAnswers: new Map(
        questions.map((q) => [q.id, new Set(q.answers.map((a) => normalizeAnswer(a.text)))]),
      ),
      activeQuestionId: questions[0]?.id ?? null,
      players: new Map(),
      sockets: new Map([[socket, { userId: meta.userId, role: 'host' as Role }]]),
    }
    this.rooms.set(gameId, room)
    meta.roomId = gameId
    this.send(socket, 'GAME_DATA', this.publicData(room))
  }

  async joinGame(socket: WebSocket, gameId: string): Promise<void> {
    const meta = this.requireMeta(socket)
    const room = this.rooms.get(gameId)
    if (!room) throw new GameFault('NOT_RUNNING', 'No game is running yet')
    const user = await this.prisma.user.findUnique({ where: { id: meta.userId } })
    if (!user) throw new GameFault('NOT_FOUND', 'User was not found')
    room.sockets.set(socket, { userId: user.id, role: 'player' })
    meta.roomId = gameId
    const existing = room.players.get(user.id)
    if (existing) {
      existing.connected = true
    } else {
      room.players.set(user.id, {
        id: user.id,
        name: user.name,
        bgColor: GAME_COLORS[room.players.size % GAME_COLORS.length],
        answers: [],
        connected: true,
      })
    }
    this.broadcastGameData(room)
  }

  changeQuestion(socket: WebSocket, questionId: string): void {
    const room = this.requireHostRoom(socket)
    if (!room.questions.some((q) => q.id === questionId)) {
      throw new GameFault('BAD_REQUEST', `Unknown question id ${questionId}`)
    }
    room.activeQuestionId = questionId
    this.broadcastGameData(room)
  }

  answerQuestion(socket: WebSocket, questionId: string, answer: string): void {
    const { room, userId } = this.requirePlayerRoom(socket)
    if (room.activeQuestionId !== questionId) {
      throw new GameFault('BAD_REQUEST', 'Answer does not match the active question')
    }
    const player = room.players.get(userId)
    if (!player) throw new GameFault('FORBIDDEN', 'Not a player of this room')
    if (player.answers.some((a) => a.questionId === questionId)) {
      throw new GameFault('CONFLICT', 'Question already answered')
    }
    // BR-63: a blank answer (after trimming) is not accepted
    const normalized = normalizeAnswer(answer)
    if (!normalized) {
      throw new GameFault('BAD_REQUEST', 'Answer must not be empty')
    }
    const accepted = room.acceptedAnswers.get(questionId)
    player.answers.push({
      questionId,
      text: answer,
      isCorrect: accepted?.has(normalized) ?? false,
    })
    this.broadcastGameData(room)
  }

  showAnswers(socket: WebSocket, questionId: string): void {
    const room = this.requireHostRoom(socket)
    this.broadcast(room, 'SHOW_ANSWERS', {
      answers: [...room.players.values()].map((player) => {
        const found = player.answers.find((a) => a.questionId === questionId)
        return {
          playerId: player.id,
          playerName: player.name,
          playerAnswer: found ?? { questionId, text: null, isCorrect: false },
        }
      }),
    })
  }

  showWinners(socket: WebSocket): void {
    const room = this.requireHostRoom(socket)
    this.broadcast(room, 'SHOW_WINNERS', {
      standings: [...room.players.values()]
        .map((p) => ({
          id: p.id,
          name: p.name,
          score: p.answers.filter((a) => a.isCorrect).length,
        }))
        .sort((a, b) => b.score - a.score),
    })
  }

  endGame(socket: WebSocket): void {
    const room = this.requireHostRoom(socket)
    this.endRoom(room.gameId)
  }

  private endRoom(gameId: string): void {
    const room = this.rooms.get(gameId)
    if (!room) return
    this.rooms.delete(gameId)
    this.broadcast(room, 'END_GAME', null)
    for (const socket of room.sockets.keys()) {
      const meta = this.clientMeta.get(socket)
      if (meta) meta.roomId = null
    }
  }

  private publicData(room: Room): PublicGameData {
    return {
      id: room.gameId,
      players: [...room.players.values()].map(({ id, name, bgColor, answers, connected }) => ({
        id,
        name,
        bgColor,
        connected,
        answers: answers.map(({ questionId }) => ({ questionId })),
      })),
      allQuestions: room.questions,
      activeQuestionId: room.activeQuestionId,
    }
  }

  private broadcastGameData(room: Room): void {
    this.broadcast(room, 'GAME_DATA', this.publicData(room))
  }

  private broadcast(room: Room, type: string, payload: unknown): void {
    for (const socket of room.sockets.keys()) this.send(socket, type, payload)
  }

  private send(socket: WebSocket, type: string, payload: unknown): void {
    if (socket.readyState !== socket.OPEN) return
    try {
      socket.send(JSON.stringify({ type, payload }))
    } catch (error) {
      this.logger.warn(`Failed to send ${type}: ${String(error)}`)
    }
  }

  sendFault(socket: WebSocket, error: unknown): void {
    const fault =
      error instanceof GameFault
        ? { code: error.code, message: error.message }
        : { code: 'INTERNAL_ERROR', message: 'Unexpected error' }
    if (!(error instanceof GameFault)) this.logger.warn('WS error', error)
    this.send(socket, 'FAULT', fault)
  }

  private requireMeta(socket: WebSocket): { userId: string; roomId: string | null } {
    const meta = this.clientMeta.get(socket)
    if (!meta) throw new GameFault('UNAUTHORIZED', 'Connection is not authenticated')
    return meta
  }

  private requireRoom(socket: WebSocket): { room: Room; userId: string } {
    const meta = this.requireMeta(socket)
    const room = meta.roomId ? this.rooms.get(meta.roomId) : undefined
    if (!room) throw new GameFault('NOT_RUNNING', 'No game is running yet')
    return { room, userId: meta.userId }
  }

  private requireHostRoom(socket: WebSocket): Room {
    const { room } = this.requireRoom(socket)
    if (room.hostSocket !== socket) {
      throw new GameFault('FORBIDDEN', 'Only the host can perform this action')
    }
    return room
  }

  private requirePlayerRoom(socket: WebSocket): { room: Room; userId: string } {
    const { room, userId } = this.requireRoom(socket)
    const info = room.sockets.get(socket)
    if (info?.role !== 'player') {
      throw new GameFault('FORBIDDEN', 'Only a player can perform this action')
    }
    return { room, userId }
  }
}
