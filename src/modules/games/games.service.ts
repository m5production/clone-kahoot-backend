import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { Game } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { ActiveGameService } from '../active-game/active-game.service'
import { assertQuestionIdPermutation } from './reorder-questions.util'

export interface GameSummary {
  id: string
  title: string
  questionCount: number
  updatedAt: Date
}

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activeGame: ActiveGameService,
  ) {}

  async listForUser(adminId: string): Promise<GameSummary[]> {
    const games = await this.prisma.game.findMany({
      where: { adminId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        _count: { select: { questions: true } },
      },
    })
    return games.map(({ _count, ...game }) => ({ ...game, questionCount: _count.questions }))
  }

  create(adminId: string, title: string): Promise<Game> {
    return this.prisma.game.create({ data: { adminId, title } })
  }

  async getOwned(id: string, adminId: string): Promise<Game> {
    const game = await this.prisma.game.findUnique({ where: { id } })
    if (!game) throw new NotFoundException(`Game with id ${id} was not found`)
    if (game.adminId !== adminId) throw new ForbiddenException('Only the game owner can access it')
    return game
  }

  async rename(id: string, adminId: string, title: string): Promise<Game> {
    await this.getOwned(id, adminId)
    this.activeGame.assertQuizEditable(id)
    return this.prisma.game.update({ where: { id }, data: { title } })
  }

  async delete(id: string, adminId: string): Promise<Game> {
    const game = await this.getOwned(id, adminId)
    this.activeGame.assertQuizEditable(id)
    await this.prisma.game.delete({ where: { id } })
    return game
  }

  /** BR-45: question/answer edits count as game changes for the updatedAt sort */
  async touch(id: string): Promise<void> {
    await this.prisma.game.update({ where: { id }, data: { updatedAt: new Date() } })
  }

  async reorderQuestions(gameId: string, adminId: string, questionIds: string[]): Promise<void> {
    await this.getOwned(gameId, adminId)
    this.activeGame.assertQuizEditable(gameId)
    const questions = await this.prisma.question.findMany({
      where: { gameId },
      select: { id: true },
    })
    assertQuestionIdPermutation(
      questions.map(({ id }) => id),
      questionIds,
    )
    await this.prisma.$transaction(async (tx) => {
      // (gameId, order) is unique, so renumber in two passes through negative
      // placeholders to avoid transient collisions inside the transaction
      for (const [index, id] of questionIds.entries()) {
        await tx.question.update({ where: { id }, data: { order: -(index + 1) } })
      }
      for (const [index, id] of questionIds.entries()) {
        await tx.question.update({ where: { id }, data: { order: index + 1 } })
      }
      await tx.game.update({ where: { id: gameId }, data: { updatedAt: new Date() } })
    })
  }
}
