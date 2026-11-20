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
import { IsNotEmpty, IsString, MaxLength } from 'class-validator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthGuard } from '../../common/guards/auth.guard'
import type { PublicUser } from '../auth/auth.service'
import { AcceptedAnswersService } from './accepted-answers.service'

class AnswerItemDto {
  // BR-47: 1-100 chars per answer; the service also rejects blanks and duplicates
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  text!: string
}

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
