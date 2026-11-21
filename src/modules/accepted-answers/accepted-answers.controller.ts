import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  ParseArrayPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import type { AcceptedAnswer } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import type { PublicUser } from '../auth/auth.service'
import { CurrentUser } from '../auth/current-user.decorator'
import { AcceptedAnswersService } from './accepted-answers.service'
import { AnswerItemDto } from './dto/answer-item.dto'

const requireQuestionId = (questionId?: string): string => {
  if (!questionId) throw new BadRequestException('Question id has not been provided')
  return questionId
}

const textsOf = (answers: AnswerItemDto[]): string[] => answers.map(({ text }) => text)

@Controller('accepted-answers')
@UseGuards(AuthGuard)
export class AcceptedAnswersController {
  constructor(private readonly answers: AcceptedAnswersService) {}

  @Get()
  list(
    @Query('questionId') questionId: string,
    @CurrentUser() user: PublicUser,
  ): Promise<AcceptedAnswer[]> {
    return this.answers.list(requireQuestionId(questionId), user.id)
  }

  @Post()
  create(
    @Query('questionId') questionId: string,
    @Body(new ParseArrayPipe({ items: AnswerItemDto })) body: AnswerItemDto[],
    @CurrentUser() user: PublicUser,
  ): Promise<AcceptedAnswer[]> {
    return this.answers.create(requireQuestionId(questionId), user.id, textsOf(body))
  }

  @Put()
  replace(
    @Query('questionId') questionId: string,
    @Body(new ParseArrayPipe({ items: AnswerItemDto })) body: AnswerItemDto[],
    @CurrentUser() user: PublicUser,
  ): Promise<AcceptedAnswer[]> {
    return this.answers.replace(requireQuestionId(questionId), user.id, textsOf(body))
  }

  @Delete()
  deleteAll(
    @Query('questionId') questionId: string,
    @CurrentUser() user: PublicUser,
  ): Promise<{ count: number }> {
    return this.answers.deleteAll(requireQuestionId(questionId), user.id)
  }
}
