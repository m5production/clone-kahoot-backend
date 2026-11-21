import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import type { Question } from '@prisma/client'
import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { CurrentUser } from '../auth/current-user.decorator'
import { AuthGuard } from '../auth/auth.guard'
import type { PublicUser } from '../auth/auth.service'
import { QuestionsService, type QuestionWithAnswersCount } from './questions.service'

const TIME_LIMITS_SEC = [10, 20, 30, 60, 90, 120]

const requireGameId = (gameId?: string): string => {
  if (!gameId) throw new BadRequestException('Game id has not been provided')
  return gameId
}

class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  gameId!: string

  // A new question is a placeholder: the editor fills its text afterwards (BR-46)
  @IsString()
  @MaxLength(300)
  text!: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  img?: string | null

  // BR-48: seconds to answer, from a fixed set (default 20)
  @IsOptional()
  @IsInt()
  @IsIn(TIME_LIMITS_SEC)
  timeLimitSec?: number
}

class UpdateQuestionDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  text!: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  img?: string | null

  // BR-48
  @IsOptional()
  @IsInt()
  @IsIn(TIME_LIMITS_SEC)
  timeLimitSec?: number
}

@Controller('questions')
@UseGuards(AuthGuard)
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  list(
    @Query('gameId') gameId: string,
    @CurrentUser() user: PublicUser,
  ): Promise<QuestionWithAnswersCount[]> {
    return this.questions.listForGame(requireGameId(gameId), user.id)
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: PublicUser): Promise<QuestionWithAnswersCount> {
    return this.questions.get(id, user.id)
  }

  @Post()
  create(
    @Body() dto: CreateQuestionDto,
    @CurrentUser() user: PublicUser,
  ): Promise<QuestionWithAnswersCount> {
    return this.questions.create(user.id, dto)
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: PublicUser,
  ): Promise<QuestionWithAnswersCount> {
    return this.questions.update(id, user.id, dto)
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: PublicUser): Promise<Question> {
    return this.questions.delete(id, user.id)
  }
}
