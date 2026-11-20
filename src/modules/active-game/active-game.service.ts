import { randomUUID } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { WebSocket } from 'ws'
import { normalizeAnswer } from '../../common/normalize-answer'
import type { AppConfig } from '../../config/configuration'
import { PrismaService } from '../../database/prisma.service'

export const GAME_COLORS = ['red', 'orange', 'blue', 'green', 'purple', 'pink']

export type Role = 'host' | 'player'

// BR-55: the session lifecycle is a strict state machine
export type SessionState = 'lobby' | 'question_open' | 'question_closed' | 'answers_shown'

export type SessionEndReason = 'finished' | 'host_ended' | 'host_timeout'

interface PlayerState {
  id: string
  name: string
  bgColor: string
  answers: { questionId: string; text: string; isCorrect: boolean }[]
  connected: boolean
}

interface QuestionSnapshot {
  id: string
  text: string
  img: string | null
  acceptedTexts: string[]
  acceptedNormalized: Set<string>
}

interface Room {
  sessionId: string
  gameId: string
  quizTitle: string
  hostId: string
  hostName: string
  state: SessionState
  questionIndex: number
  questions: QuestionSnapshot[]
  players: Map<string, PlayerState>
  sockets: Map<WebSocket, { userId: string; role: Role }>
  hostGraceTimer: NodeJS.Timeout | null
}

export interface SessionSummary {
  state: SessionState
  quizTitle: string
  hostName: string
}

export interface SessionStateMessage {
  sessionId: string
  gameId: string
  quizTitle: string
  state: SessionState
  hostConnected: boolean
  players: {
    id: string
    name: string
    bgColor: string
    connected: boolean
    answered: boolean
  }[]
  question: { id: string; text: string; img: string | null; number: number; total: number } | null
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
  private readonly endedSessions = new Map<string, 'finished' | 'aborted'>()
  private readonly clientMeta = new Map<WebSocket, { userId: string; roomId: string | null }>()
  private readonly hostGraceMs: number

  constructor(
    private readonly prisma: PrismaService,
    config?: ConfigService,
  ) {
    this.hostGraceMs = (config?.get<AppConfig>('app')?.hostGraceSeconds ?? 300) * 1000
  }

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
    if (!info) return
    if (info.role === 'host') {
      // BR-59: the room survives a host disconnect; a grace timer aborts it
      // if the host does not come back in time
      if (!this.isHostConnected(room)) this.startHostGrace(room)
    } else {
      const player = room.players.get(info.userId)
      if (player && ![...room.sockets.values()].some((s) => s.userId === info.userId)) {
        player.connected = false
      }
      this.maybeCloseQuestion(room)
    }
    this.broadcastSessionState(room)
  }

  /** BR-54: while a session runs, its quiz cannot be edited or deleted */
  isSessionRunning(gameId: string): boolean {
    return [...this.rooms.values()].some((room) => room.gameId === gameId)
  }

  assertQuizEditable(gameId: string): void {
    if (this.isSessionRunning(gameId)) {
      throw new ConflictException('A live session is running for this quiz')
    }
  }

  /** REST POST /api/games/:id/sessions — creates a lobby (BR-50, BR-51) */
  async createSession(
    gameId: string,
    hostId: string,
  ): Promise<{ sessionId: string; joinPath: string }> {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } })
    if (!game) throw new NotFoundException(`Game with id ${gameId} was not found`)
    if (game.adminId !== hostId) {
      throw new ForbiddenException('Only the game owner can start it')
    }
    const running = [...this.rooms.values()].find(
      (room) => room.gameId === gameId || room.hostId === hostId,
    )
    if (running) {
      // BR-51, FR-61: one session per quiz, one session per host; the response
      // carries the existing session id so the host can return to it
      throw new ConflictException({
        message: 'A live session already exists',
        sessionId: running.sessionId,
      })
    }
    const host = await this.prisma.user.findUnique({ where: { id: hostId } })
    if (!host) throw new NotFoundException('User was not found')
    const questions = await this.prisma.question.findMany({
      where: { gameId },
      orderBy: { order: 'asc' },
      include: { answers: true },
    })
    // BR-49: a quiz is launchable only when every question has text and answers
    const quizNotReady =
      questions.length === 0 || questions.some((q) => !q.text.trim() || q.answers.length === 0)
    if (quizNotReady) {
      throw new BadRequestException(
        'The quiz is not ready: every question needs text and at least one accepted answer',
      )
    }
    const sessionId = randomUUID()
    // BR-54: the session plays a snapshot taken at launch time
    const room: Room = {
      sessionId,
      gameId,
      quizTitle: game.title,
      hostId,
      hostName: host.name,
      state: 'lobby',
      questionIndex: -1,
      questions: questions.map((q) => ({
        id: q.id,
        text: q.text,
        img: q.img,
        acceptedTexts: q.answers.map((a) => a.text),
        acceptedNormalized: new Set(q.answers.map((a) => normalizeAnswer(a.text))),
      })),
      players: new Map(),
      sockets: new Map(),
      hostGraceTimer: null,
    }
    this.rooms.set(sessionId, room)
    // the host must join over WS before the grace expires
    this.startHostGrace(room)
    return { sessionId, joinPath: `/join/${sessionId}` }
  }

  /** REST GET /api/sessions/:id — public summary for the /join/:id page (FR-73) */
  getSessionSummary(sessionId: string): SessionSummary {
    const room = this.rooms.get(sessionId)
    if (room) {
      return { state: room.state, quizTitle: room.quizTitle, hostName: room.hostName }
    }
    const ended = this.endedSessions.get(sessionId)
    if (ended) {
      throw new GoneException(
        ended === 'finished' ? 'The game has finished' : 'The game was aborted',
      )
    }
    throw new NotFoundException('No such session')
  }

  /** JOIN_SESSION — entry and reconnect for both host and player (BR-56..BR-58) */
  async joinSession(socket: WebSocket, sessionId: string): Promise<void> {
    const meta = this.requireMeta(socket)
    const room = this.rooms.get(sessionId)
    if (!room) throw new GameFault('NOT_FOUND', 'No such session or it has already ended')
    const user = await this.prisma.user.findUnique({ where: { id: meta.userId } })
    if (!user) throw new GameFault('NOT_FOUND', 'User was not found')

    // BR-56: the host cannot be a player in their own session — the role is
    // decided by the server, not claimed by the client
    const role: Role = user.id === room.hostId ? 'host' : 'player'
    room.sockets.set(socket, { userId: user.id, role })
    meta.roomId = sessionId

    if (role === 'host') {
      this.stopHostGrace(room)
      this.send(socket, 'JOINED_SESSION', { role, sessionId })
    } else {
      const existing = room.players.get(user.id)
      if (existing) {
        existing.connected = true
        // BR-58: on reconnect the player gets their answer to the current
        // question back — the UI prefills the (already locked) form with it
        const question = room.questionIndex >= 0 ? room.questions[room.questionIndex] : undefined
        const given = question && existing.answers.find((a) => a.questionId === question.id)
        if (given) {
          this.send(socket, 'ANSWER_ACCEPTED', {
            questionId: question.id,
            text: given.text,
          })
        }
      } else {
        room.players.set(user.id, {
          id: user.id,
          name: user.name,
          bgColor: GAME_COLORS[room.players.size % GAME_COLORS.length],
          answers: [],
          connected: true,
        })
      }
      this.send(socket, 'JOINED_SESSION', { role, sessionId })
      // a reconnecting player re-receives the data the broadcast already sent
      if (room.state === 'answers_shown') {
        this.sendAnswersRevealed(socket, room)
      }
    }
    this.broadcastSessionState(room)
  }

  /** START_GAME — lobby → first question (FR-64) */
  startGame(socket: WebSocket): void {
    const room = this.requireHostRoom(socket)
    if (room.state !== 'lobby') {
      throw new GameFault('BAD_REQUEST', 'The game can only be started from the lobby')
    }
    room.questionIndex = 0
    room.state = 'question_open'
    this.broadcastSessionState(room)
  }

  /** NEXT_QUESTION — strictly the next one in order (BR-60, FR-64) */
  nextQuestion(socket: WebSocket): void {
    const room = this.requireHostRoom(socket)
    if (room.state !== 'answers_shown') {
      throw new GameFault('BAD_REQUEST', 'The next question starts only after answers are shown')
    }
    // BR-60: after the last question only "show winners" is available
    if (room.questionIndex === room.questions.length - 1) {
      throw new GameFault('BAD_REQUEST', 'This was the last question; show the winners')
    }
    room.questionIndex += 1
    room.state = 'question_open'
    this.broadcastSessionState(room)
  }

  /** CLOSE_QUESTION — early close by the host (BR-61, FR-66) */
  closeQuestion(socket: WebSocket): void {
    const room = this.requireHostRoom(socket)
    this.closeCurrentQuestion(room)
  }

  /** SHOW_ANSWERS — only for a closed question (BR-66) */
  showAnswers(socket: WebSocket): void {
    const room = this.requireHostRoom(socket)
    if (room.state !== 'question_closed') {
      throw new GameFault('BAD_REQUEST', 'Answers can be shown only after the question is closed')
    }
    room.state = 'answers_shown'
    this.broadcast(room, 'ANSWERS_REVEALED', this.answersRevealed(room))
    this.broadcastSessionState(room)
  }

  /** SHOW_WINNERS — only after the last question's answers are shown (FR-68) */
  showWinners(socket: WebSocket): void {
    const room = this.requireHostRoom(socket)
    if (room.state !== 'answers_shown') {
      throw new GameFault('BAD_REQUEST', 'Winners can be shown only after answers are shown')
    }
    if (room.questionIndex !== room.questions.length - 1) {
      throw new GameFault('BAD_REQUEST', 'Winners are shown only after the last question')
    }
    this.broadcast(room, 'WINNERS', { standings: this.standings(room) })
    this.endRoom(room, 'finished')
  }

  /** END_SESSION — early end by the host with a client-side confirm (FR-70) */
  endSession(socket: WebSocket): void {
    const room = this.requireHostRoom(socket)
    this.endRoom(room, 'host_ended')
  }

  answerQuestion(socket: WebSocket, questionId: string, answer: string): void {
    const { room, userId } = this.requirePlayerRoom(socket)
    if (room.state !== 'question_open') {
      throw new GameFault('BAD_REQUEST', 'No question is open for answers')
    }
    const question = room.questions[room.questionIndex]
    if (question.id !== questionId) {
      throw new GameFault('BAD_REQUEST', 'Answer does not match the active question')
    }
    const player = room.players.get(userId)
    if (!player) throw new GameFault('FORBIDDEN', 'Not a player of this room')
    // BR-63: only the first answer counts
    if (player.answers.some((a) => a.questionId === questionId)) {
      throw new GameFault('CONFLICT', 'Question already answered')
    }
    // BR-63: a blank answer (after trimming) is not accepted
    const normalized = normalizeAnswer(answer)
    if (!normalized) {
      throw new GameFault('BAD_REQUEST', 'Answer must not be empty')
    }
    player.answers.push({
      questionId,
      text: answer,
      isCorrect: question.acceptedNormalized.has(normalized),
    })
    this.send(socket, 'ANSWER_ACCEPTED', { questionId, text: answer })
    this.maybeCloseQuestion(room)
    this.broadcastSessionState(room)
  }

  /** BR-61: the question closes when every connected player has answered */
  private maybeCloseQuestion(room: Room): void {
    if (room.state !== 'question_open') return
    const question = room.questions[room.questionIndex]
    const online = [...room.players.values()].filter((player) => player.connected)
    if (
      online.length > 0 &&
      online.every((player) => player.answers.some((a) => a.questionId === question.id))
    ) {
      this.closeCurrentQuestion(room)
    }
  }

  private closeCurrentQuestion(room: Room): void {
    if (room.state !== 'question_open') {
      throw new GameFault('BAD_REQUEST', 'No question is open')
    }
    room.state = 'question_closed'
    this.broadcast(room, 'QUESTION_CLOSED', {
      questionId: room.questions[room.questionIndex].id,
    })
    this.broadcastSessionState(room)
  }

  private answersRevealed(room: Room): unknown {
    const question = room.questions[room.questionIndex]
    return {
      questionId: question.id,
      // FR-67: accepted answers are always included, even when nobody was right
      acceptedAnswers: question.acceptedTexts,
      answers: [...room.players.values()].map((player) => {
        const found = player.answers.find((a) => a.questionId === question.id)
        return {
          playerId: player.id,
          playerName: player.name,
          text: found?.text ?? null,
          isCorrect: found?.isCorrect ?? false,
        }
      }),
    }
  }

  private sendAnswersRevealed(socket: WebSocket, room: Room): void {
    this.send(socket, 'ANSWERS_REVEALED', this.answersRevealed(room))
  }

  private standings(room: Room): { id: string; name: string; score: number }[] {
    return [...room.players.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: p.answers.filter((a) => a.isCorrect).length,
      }))
      .sort((a, b) => b.score - a.score)
  }

  private isHostConnected(room: Room): boolean {
    return [...room.sockets.values()].some((s) => s.role === 'host')
  }

  private startHostGrace(room: Room): void {
    this.stopHostGrace(room)
    room.hostGraceTimer = setTimeout(() => {
      if (!this.isHostConnected(room)) this.endRoom(room, 'host_timeout')
    }, this.hostGraceMs)
    room.hostGraceTimer.unref?.()
  }

  private stopHostGrace(room: Room): void {
    if (room.hostGraceTimer) {
      clearTimeout(room.hostGraceTimer)
      room.hostGraceTimer = null
    }
  }

  private endRoom(room: Room, reason: SessionEndReason): void {
    this.stopHostGrace(room)
    this.rooms.delete(room.sessionId)
    this.endedSessions.set(room.sessionId, reason === 'finished' ? 'finished' : 'aborted')
    this.broadcast(room, 'SESSION_ENDED', { reason })
    for (const socket of room.sockets.keys()) {
      const meta = this.clientMeta.get(socket)
      if (meta) meta.roomId = null
    }
  }

  private sessionState(room: Room): SessionStateMessage {
    const question = room.questionIndex >= 0 ? room.questions[room.questionIndex] : undefined
    return {
      sessionId: room.sessionId,
      gameId: room.gameId,
      quizTitle: room.quizTitle,
      state: room.state,
      hostConnected: this.isHostConnected(room),
      players: [...room.players.values()].map(({ id, name, bgColor, answers, connected }) => ({
        id,
        name,
        bgColor,
        connected,
        answered: question ? answers.some((a) => a.questionId === question.id) : false,
      })),
      question: question
        ? {
            id: question.id,
            text: question.text,
            img: question.img,
            number: room.questionIndex + 1,
            total: room.questions.length,
          }
        : null,
    }
  }

  private broadcastSessionState(room: Room): void {
    this.broadcast(room, 'SESSION_STATE', this.sessionState(room))
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
    if (!room) throw new GameFault('NOT_RUNNING', 'Not joined to any session')
    return { room, userId: meta.userId }
  }

  private requireHostRoom(socket: WebSocket): Room {
    const { room, userId } = this.requireRoom(socket)
    if (room.sockets.get(socket)?.role !== 'host' || room.hostId !== userId) {
      throw new GameFault('FORBIDDEN', 'Only the host can perform this action')
    }
    return room
  }

  private requirePlayerRoom(socket: WebSocket): { room: Room; userId: string } {
    const { room, userId } = this.requireRoom(socket)
    if (room.sockets.get(socket)?.role !== 'player') {
      throw new GameFault('FORBIDDEN', 'Only a player can perform this action')
    }
    return { room, userId }
  }
}
