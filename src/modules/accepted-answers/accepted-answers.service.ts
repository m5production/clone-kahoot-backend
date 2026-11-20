import { Injectable, NotFoundException } from '@nestjs/common'
import type { AcceptedAnswer, Question } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { GamesService } from '../games/games.service'
import { assertValidAnswerTexts } from './accepted-answers.util'

@Injectable()
export class AcceptedAnswersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
  ) {}

  private async getOwnedQuestion(questionId: string, userId: string): Promise<Question> {
    // TODO(stage 4a, BR-54): reject changes while a session is running for this game
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
    const question = await this.getOwnedQuestion(questionId, userId)
    const existing = await this.prisma.acceptedAnswer.findMany({
      where: { questionId },
      select: { text: true },
    })
    assertValidAnswerTexts(
      existing.map(({ text }) => text),
      texts,
    )
    const created = await this.prisma.acceptedAnswer.createManyAndReturn({
      data: texts.map((text) => ({ questionId, text })),
    })
    await this.games.touch(question.gameId)
    return created
  }

  async replace(questionId: string, userId: string, texts: string[]): Promise<AcceptedAnswer[]> {
    const question = await this.getOwnedQuestion(questionId, userId)
    assertValidAnswerTexts([], texts)
    const replaced = await this.prisma.$transaction(async (tx) => {
      await tx.acceptedAnswer.deleteMany({ where: { questionId } })
      const created = await tx.acceptedAnswer.createManyAndReturn({
        data: texts.map((text) => ({ questionId, text })),
      })
      await tx.game.update({ where: { id: question.gameId }, data: { updatedAt: new Date() } })
      return created
    })
    return replaced
  }

  async deleteAll(questionId: string, userId: string): Promise<{ count: number }> {
    const question = await this.getOwnedQuestion(questionId, userId)
    const result = await this.prisma.acceptedAnswer.deleteMany({ where: { questionId } })
    await this.games.touch(question.gameId)
    return result
  }
}
