import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'

export type RecordStatus = 'running' | 'finished' | 'aborted'

interface QuestionRecordInput {
  position: number
  text: string
  img: string | null
  timeLimitSec: number
  type: 'open' | 'choice'
  /** choice questions snapshot their options: [{text, isCorrect}] */
  options: { text: string; isCorrect: boolean }[] | null
  acceptedAnswers: string[]
}

interface PlayerRecordInput {
  userId: string
  nickname: string
  color: string
  score: number
  correctCount: number
  correctTimeMs: number
}

interface AnswerRecordInput {
  userId: string
  text: string
  isCorrect: boolean
  responseTimeMs: number
  points: number
}

/** FR-80: one row of the host's history list */
export interface HistoryEntry {
  id: string
  gameId: string | null
  quizTitle: string
  status: RecordStatus
  startedAt: Date
  endedAt: Date | null
  playerCount: number
  winner: { name: string; score: number } | null
}

@Injectable()
export class HistoryService implements OnModuleInit {
  private readonly logger = new Logger(HistoryService.name)

  constructor(private readonly prisma: PrismaService) {}

  /** NFR-R7: a restart strands live rooms, so stale 'running' rows become 'aborted' */
  async onModuleInit(): Promise<void> {
    const { count } = await this.prisma.gameSession.updateMany({
      where: { status: 'running' },
      data: { status: 'aborted', endedAt: new Date() },
    })
    if (count > 0) {
      this.logger.log(`Marked ${count} stale session(s) as aborted`)
    }
  }

  /**
   * BR-80: the session row and the question snapshot are written when the
   * session is created. Returns the SessionQuestion ids in position order so
   * the room can attach answer records later.
   */
  async startRecord(input: {
    sessionId: string
    gameId: string
    hostId: string
    quizTitle: string
    questions: QuestionRecordInput[]
  }): Promise<string[]> {
    const session = await this.prisma.gameSession.create({
      data: {
        id: input.sessionId,
        gameId: input.gameId,
        hostId: input.hostId,
        quizTitle: input.quizTitle,
        questions: {
          create: input.questions.map((q) => ({
            position: q.position,
            text: q.text,
            img: q.img,
            timeLimitSec: q.timeLimitSec,
            type: q.type,
            options: q.options ?? undefined,
            acceptedAnswers: q.acceptedAnswers,
          })),
        },
      },
      include: { questions: { orderBy: { position: 'asc' } } },
    })
    return session.questions.map((q) => q.id)
  }

  /** NFR-R6: running totals and the answers of a question are persisted when it closes */
  async recordQuestionClosed(input: {
    sessionId: string
    sessionQuestionId: string
    players: PlayerRecordInput[]
    answers: AnswerRecordInput[]
  }): Promise<void> {
    const playerIds = new Map<string, string>()
    for (const player of input.players) {
      const row = await this.prisma.sessionPlayer.upsert({
        where: {
          sessionId_userId: {
            sessionId: input.sessionId,
            userId: player.userId,
          },
        },
        create: {
          sessionId: input.sessionId,
          userId: player.userId,
          nickname: player.nickname,
          color: player.color,
          score: player.score,
          correctCount: player.correctCount,
          correctTimeMs: player.correctTimeMs,
        },
        update: {
          nickname: player.nickname,
          color: player.color,
          score: player.score,
          correctCount: player.correctCount,
          correctTimeMs: player.correctTimeMs,
        },
      })
      playerIds.set(player.userId, row.id)
    }

    for (const answer of input.answers) {
      const sessionPlayerId = playerIds.get(answer.userId)
      if (!sessionPlayerId) continue
      await this.prisma.sessionAnswer.upsert({
        where: {
          sessionPlayerId_sessionQuestionId: {
            sessionPlayerId,
            sessionQuestionId: input.sessionQuestionId,
          },
        },
        create: {
          sessionPlayerId,
          sessionQuestionId: input.sessionQuestionId,
          text: answer.text,
          isCorrect: answer.isCorrect,
          responseTimeMs: answer.responseTimeMs,
          points: answer.points,
        },
        update: {},
      })
    }
  }

  /** BR-80: final status, the end timestamp and the places are saved when the session ends */
  async finishRecord(input: {
    sessionId: string
    status: 'finished' | 'aborted'
    players: (PlayerRecordInput & { place: number })[]
  }): Promise<void> {
    await this.prisma.gameSession.updateMany({
      where: { id: input.sessionId },
      data: { status: input.status, endedAt: new Date() },
    })
    for (const player of input.players) {
      const { place } = player
      await this.prisma.sessionPlayer.upsert({
        where: {
          sessionId_userId: {
            sessionId: input.sessionId,
            userId: player.userId,
          },
        },
        create: {
          sessionId: input.sessionId,
          userId: player.userId,
          nickname: player.nickname,
          color: player.color,
          score: player.score,
          correctCount: player.correctCount,
          correctTimeMs: player.correctTimeMs,
          place,
        },
        update: {
          nickname: player.nickname,
          color: player.color,
          score: player.score,
          correctCount: player.correctCount,
          correctTimeMs: player.correctTimeMs,
          place,
        },
      })
    }
  }

  /** FR-80: the host's own history, newest first; a quiz filter serves FR-83 */
  async listHistory(hostId: string, gameId?: string): Promise<HistoryEntry[]> {
    const sessions = await this.prisma.gameSession.findMany({
      where: { hostId, ...(gameId ? { gameId } : {}), status: { not: 'running' } },
      orderBy: { startedAt: 'desc' },
      include: { players: true },
    })
    return sessions.map((session) => {
      const winner =
        session.players.filter((p) => p.place === 1).sort((a, b) => b.score - a.score)[0] ?? null
      return {
        id: session.id,
        gameId: session.gameId,
        quizTitle: session.quizTitle,
        status: session.status as RecordStatus,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        playerCount: session.players.length,
        winner: winner ? { name: winner.nickname, score: winner.score } : null,
      }
    })
  }

  /** FR-81: the report is visible to the session's host only (BR-81) */
  async getReport(sessionId: string, userId: string) {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: {
        players: { include: { answers: true } },
        questions: { orderBy: { position: 'asc' } },
      },
    })
    if (!session || session.hostId !== userId || session.status === 'running') {
      // BR-81: a foreign or missing record is indistinguishable from absent
      throw new NotFoundException('No such session record')
    }
    const players = [...session.players].sort(
      (a, b) => (a.place ?? Number.MAX_SAFE_INTEGER) - (b.place ?? Number.MAX_SAFE_INTEGER),
    )
    return {
      id: session.id,
      gameId: session.gameId,
      quizTitle: session.quizTitle,
      status: session.status,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      standings: players.map((p) => ({
        place: p.place,
        userId: p.userId,
        nickname: p.nickname,
        score: p.score,
        correctCount: p.correctCount,
      })),
      questions: session.questions.map((q) => ({
        id: q.id,
        position: q.position,
        text: q.text,
        img: q.img,
        timeLimitSec: q.timeLimitSec,
        type: q.type as 'open' | 'choice',
        options: (q.options as { text: string; isCorrect: boolean }[] | null) ?? null,
        acceptedAnswers: q.acceptedAnswers as string[],
        answers: players.map((p) => {
          const found = p.answers.find((a) => a.sessionQuestionId === q.id)
          return {
            userId: p.userId,
            nickname: p.nickname,
            text: found?.text ?? null,
            isCorrect: found?.isCorrect ?? false,
            responseTimeMs: found?.responseTimeMs ?? null,
            points: found?.points ?? 0,
          }
        }),
      })),
    }
  }

  /** FR-82/BR-82: the host can delete a finished record; a live session is not history yet */
  async deleteRecord(sessionId: string, userId: string): Promise<void> {
    const session = await this.prisma.gameSession.findUnique({
      where: { id: sessionId },
    })
    if (!session || session.hostId !== userId) {
      throw new NotFoundException('No such session record')
    }
    if (session.status === 'running') {
      throw new ConflictException('The session is still live')
    }
    await this.prisma.gameSession.delete({ where: { id: sessionId } })
  }
}
