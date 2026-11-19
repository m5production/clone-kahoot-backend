import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common'
import type { Game } from '@prisma/client'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthGuard } from '../../common/guards/auth.guard'
import type { PublicUser } from '../auth/auth.service'
import { GamesService } from './games.service'

@Controller('games')
@UseGuards(AuthGuard)
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  list(@CurrentUser() user: PublicUser): Promise<Game[]> {
    return this.games.listForUser(user.id)
  }

  @Post()
  create(@CurrentUser() user: PublicUser): Promise<Game> {
    return this.games.create(user.id)
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: PublicUser): Promise<Game> {
    return this.games.getOwned(id, user.id)
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: PublicUser): Promise<Game> {
    return this.games.delete(id, user.id)
  }
}
