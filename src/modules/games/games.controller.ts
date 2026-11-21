import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import type { Game } from '@prisma/client'
import { RateLimit } from '../../common/guards/rate-limit.guard'
import { AuthGuard } from '../auth/auth.guard'
import type { PublicUser } from '../auth/auth.service'
import { CurrentUser } from '../auth/current-user.decorator'
import { GameTitleDto } from './dto/game-title.dto'
import { ReorderQuestionsDto } from './dto/reorder-questions.dto'
import { GamesService, type GameSummary } from './games.service'

@Controller('games')
@UseGuards(AuthGuard)
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  list(@CurrentUser() user: PublicUser): Promise<GameSummary[]> {
    return this.games.listForUser(user.id)
  }

  @Post()
  @UseGuards(RateLimit(30, 60))
  create(@Body() dto: GameTitleDto, @CurrentUser() user: PublicUser): Promise<Game> {
    return this.games.create(user.id, dto.title)
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: PublicUser): Promise<Game> {
    return this.games.getOwned(id, user.id)
  }

  @Patch(':id')
  rename(
    @Param('id') id: string,
    @Body() dto: GameTitleDto,
    @CurrentUser() user: PublicUser,
  ): Promise<Game> {
    return this.games.rename(id, user.id, dto.title)
  }

  @Patch(':id/questions/reorder')
  reorderQuestions(
    @Param('id') id: string,
    @Body() dto: ReorderQuestionsDto,
    @CurrentUser() user: PublicUser,
  ): Promise<void> {
    return this.games.reorderQuestions(id, user.id, dto.questionIds)
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: PublicUser): Promise<Game> {
    return this.games.delete(id, user.id)
  }
}
