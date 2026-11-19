import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import type { Game } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service'

@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(adminId: string): Promise<Game[]> {
    return this.prisma.game.findMany({ where: { adminId }, orderBy: { createdAt: 'asc' } })
  }

  create(adminId: string): Promise<Game> {
    return this.prisma.game.create({ data: { adminId } })
  }

  async getOwned(id: string, adminId: string): Promise<Game> {
    const game = await this.prisma.game.findUnique({ where: { id } })
    if (!game) throw new NotFoundException(`Game with id ${id} was not found`)
    if (game.adminId !== adminId) throw new ForbiddenException('Only the game owner can access it')
    return game
  }

  async delete(id: string, adminId: string): Promise<Game> {
    const game = await this.getOwned(id, adminId)
    await this.prisma.game.delete({ where: { id } })
    return game
  }
}
