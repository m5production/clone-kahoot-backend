import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import type { Game } from '@prisma/client'
import { Transform } from 'class-transformer'
import { ArrayMinSize, IsArray, IsString, Length } from 'class-validator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthGuard } from '../../common/guards/auth.guard'
import type { PublicUser } from '../auth/auth.service'
import { GamesService, type GameSummary } from './games.service'

class GameTitleDto {
  // BR-44: title is required, 1-80 chars, trimmed
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  title!: string
}

class ReorderQuestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  questionIds!: string[]
}

@Controller('games')
@UseGuards(AuthGuard)
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  list(@CurrentUser() user: PublicUser): Promise<GameSummary[]> {
    return this.games.listForUser(user.id)
  }

  @Post()
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
