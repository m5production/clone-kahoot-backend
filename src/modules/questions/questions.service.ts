import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Question } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'
import { GamesService } from '../games/games.service'

export interface QuestionDto {
  gameId: string
  text: string
  img?: string | null
}

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly games: GamesService,
  ) {}

  async listForGame(gameId: string, userId: string): Promise<Question[]> {
    await this.games.getOwned(gameId, userId)
    return this.prisma.question.findMany({ where: { gameId }, orderBy: { order: 'asc' } })
  }

  async get(id: string, userId: string): Promise<Question> {
    const question = await this.prisma.question.findUnique({ where: { id } })
    if (!question) throw new NotFoundException(`Question with id ${id} was not found`)
    await this.games.getOwned(question.gameId, userId)
    return question
  }

  async create(userId: string, dto: QuestionDto): Promise<Question> {
    await this.games.getOwned(dto.gameId, userId)
    const last = await this.prisma.question.findFirst({
      where: { gameId: dto.gameId },
      orderBy: { order: 'desc' },
      select: { order: true },
    })
    try {
      return await this.prisma.question.create({
        data: {
          gameId: dto.gameId,
          text: dto.text,
          img: dto.img ?? null,
          order: (last?.order ?? 0) + 1,
        },
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new BadRequestException('Question order conflict, retry')
      }
      throw error
    }
  }

  async update(
    id: string,
    userId: string,
    dto: { text: string; img?: string | null },
  ): Promise<Question> {
    const question = await this.get(id, userId)
    return this.prisma.question.update({
      where: { id },
      data: { text: dto.text, img: dto.img ?? question.img },
    })
  }

  async delete(id: string, userId: string): Promise<Question> {
    const question = await this.get(id, userId)
    await this.prisma.question.delete({ where: { id } })
    return question
  }
}
