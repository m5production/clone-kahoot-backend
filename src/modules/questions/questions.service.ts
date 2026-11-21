import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Question } from '@prisma/client'
import { isUniqueViolation } from '../../common/prisma-error'
import { PrismaService } from '../../database/prisma.service'
import { ActiveGameService } from '../active-game/active-game.service'
import { GamesService } from '../games/games.service'

export interface QuestionDto {
  gameId: string
  text: string
  img?: string | null
  timeLimitSec?: number
}

export type QuestionWithAnswersCount = Question & { answersCount: number }

const answersCountInclude = { _count: { select: { answers: true } } } as const

const withAnswersCount = ({
  _count,
  ...question
}: Question & { _count: { answers: number } }): QuestionWithAnswersCount => ({
  ...question,
  answersCount: _count.answers,
})

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
    private readonly activeGame: ActiveGameService,
  ) {}

  async listForGame(gameId: string, userId: string): Promise<QuestionWithAnswersCount[]> {
    await this.games.getOwned(gameId, userId)
    const questions = await this.prisma.question.findMany({
      where: { gameId },
      orderBy: { order: 'asc' },
      include: answersCountInclude,
    })
    return questions.map(withAnswersCount)
  }

  async get(id: string, userId: string): Promise<QuestionWithAnswersCount> {
    const question = await this.prisma.question.findUnique({
      where: { id },
      include: answersCountInclude,
    })
    if (!question) throw new NotFoundException(`Question with id ${id} was not found`)
    await this.games.getOwned(question.gameId, userId)
    return withAnswersCount(question)
  }

  async create(userId: string, dto: QuestionDto): Promise<QuestionWithAnswersCount> {
    await this.games.getOwned(dto.gameId, userId)
    this.activeGame.assertQuizEditable(dto.gameId)
    const last = await this.prisma.question.findFirst({
      where: { gameId: dto.gameId },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    try {
      const question = await this.prisma.question.create({
        data: {
          gameId: dto.gameId,
          text: dto.text,
          img: dto.img ?? null,
          timeLimitSec: dto.timeLimitSec,
          order: (last?.order ?? 0) + 1,
        },
        include: answersCountInclude,
      })
      await this.games.touch(dto.gameId)
      return withAnswersCount(question)
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new BadRequestException('Question order conflict, retry')
      }
      throw error
    }
  }

  async update(
    id: string,
    userId: string,
    dto: { text: string; img?: string | null; timeLimitSec?: number },
  ): Promise<QuestionWithAnswersCount> {
    const question = await this.get(id, userId)
    this.activeGame.assertQuizEditable(question.gameId)
    const updated = await this.prisma.question.update({
      where: { id },
      data: {
        text: dto.text,
        // absent field keeps the stored value; explicit null clears it
        img: dto.img === undefined ? question.img : dto.img,
        timeLimitSec: dto.timeLimitSec ?? question.timeLimitSec,
      },
      include: answersCountInclude,
    })
    await this.games.touch(question.gameId)
    return withAnswersCount(updated)
  }

  async delete(id: string, userId: string): Promise<Question> {
    const question = await this.get(id, userId)
    this.activeGame.assertQuizEditable(question.gameId)
    await this.prisma.question.delete({ where: { id } })
    await this.games.touch(question.gameId)
    return question
  }
}
