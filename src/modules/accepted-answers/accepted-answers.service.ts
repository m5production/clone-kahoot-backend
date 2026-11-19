import { Injectable, NotFoundException } from '@nestjs/common'
import type { AcceptedAnswer } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { GamesService } from '../games/games.service'

@Injectable()
export class AcceptedAnswersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
  ) {}

  private async getOwnedQuestion(questionId: string, userId: string) {
    const question = await this.prisma.question.findUnique({ where: { id: questionId } })
    if (!question) {
      throw new NotFoundException(`Question with id ${questionId} was not found`)
    }
    await this.games.getOwned(question.gameId, userId)
    return question
  }

  async list(questionId: string, userId: string): Promise<AcceptedAnswer[]> {
    await this.getOwnedQuestion(questionId, userId)
    return this.prisma.acceptedAnswer.findMany({ where: { questionId } })
  }

  async create(questionId: string, userId: string, texts: string[]): Promise<AcceptedAnswer[]> {
    await this.getOwnedQuestion(questionId, userId)
    return this.prisma.acceptedAnswer.createManyAndReturn({
      data: texts.map((text) => ({ questionId, text })),
    })
  }

  async replace(questionId: string, userId: string, texts: string[]): Promise<AcceptedAnswer[]> {
    await this.getOwnedQuestion(questionId, userId)
    return this.prisma.$transaction(async (tx) => {
      await tx.acceptedAnswer.deleteMany({ where: { questionId } })
      if (texts.length === 0) return []
      return tx.acceptedAnswer.createManyAndReturn({
        data: texts.map((text) => ({ questionId, text })),
      })
    })
  }

  async deleteAll(questionId: string, userId: string): Promise<{ count: number }> {
    await this.getOwnedQuestion(questionId, userId)
    return this.prisma.acceptedAnswer.deleteMany({ where: { questionId } })
  }
}
