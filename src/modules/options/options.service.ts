import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Question, QuestionOption } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { ActiveGameService } from '../active-game/active-game.service'
import { GamesService } from '../games/games.service'
import { assertValidOptions, type OptionInput } from './options.util'

@Injectable()
export class OptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
    private readonly activeGame: ActiveGameService,
  ) {}

  private async getOwnedQuestion(questionId: string, userId: string): Promise<Question> {
    const question = await this.prisma.question.findUnique({ where: { id: questionId } })
    if (!question) {
      throw new NotFoundException(`Question with id ${questionId} was not found`)
    }
    await this.games.getOwned(question.gameId, userId)
    return question
  }

  async list(questionId: string, userId: string): Promise<QuestionOption[]> {
    await this.getOwnedQuestion(questionId, userId)
    return this.prisma.questionOption.findMany({
      where: { questionId },
      orderBy: { order: 'asc' },
    })
  }

  /** Transactional replacement of the whole option set — mirror of PUT /accepted-answers */
  async replace(
    questionId: string,
    userId: string,
    options: OptionInput[],
  ): Promise<QuestionOption[]> {
    const question = await this.getOwnedQuestion(questionId, userId)
    this.activeGame.assertQuizEditable(question.gameId)
    // D-12: a question holds only the data of its own type
    if (question.type !== 'choice') {
      throw new BadRequestException('Options can be set only on a choice question')
    }
    assertValidOptions(options)
    return this.prisma.$transaction(async (tx) => {
      await tx.questionOption.deleteMany({ where: { questionId } })
      const created = await tx.questionOption.createManyAndReturn({
        data: options.map((option, index) => ({
          questionId,
          order: index,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
      })
      await tx.game.update({ where: { id: question.gameId }, data: { updatedAt: new Date() } })
      return created
    })
  }
}
