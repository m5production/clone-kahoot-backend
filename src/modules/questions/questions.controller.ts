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
import { AuthGuard } from '../auth/auth.guard'
import type { PublicUser } from '../auth/auth.service'
import { CurrentUser } from '../auth/current-user.decorator'
import { CreateQuestionDto } from './dto/create-question.dto'
import { UpdateQuestionDto } from './dto/update-question.dto'
import { QuestionsService, type QuestionWithAnswersCount } from './questions.service'

const requireGameId = (gameId?: string): string => {
  if (!gameId) throw new BadRequestException('Game id has not been provided')
  return gameId
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
