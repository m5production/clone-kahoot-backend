import {
  BadRequestException,
  Body,
  Controller,
  Get,
  ParseArrayPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common'
import type { QuestionOption } from '@prisma/client'
import { AuthGuard } from '../auth/auth.guard'
import type { PublicUser } from '../auth/auth.service'
import { CurrentUser } from '../auth/current-user.decorator'
import { OptionItemDto } from './dto/option-item.dto'
import { OptionsService } from './options.service'

const requireQuestionId = (questionId?: string): string => {
  if (!questionId) throw new BadRequestException('Question id has not been provided')
  return questionId
}

@Controller('options')
@UseGuards(AuthGuard)
export class OptionsController {
  constructor(private readonly options: OptionsService) {}

  @Get()
  list(
    @Query('questionId') questionId: string,
    @CurrentUser() user: PublicUser,
  ): Promise<QuestionOption[]> {
    return this.options.list(requireQuestionId(questionId), user.id)
  }

  @Put()
  replace(
    @Query('questionId') questionId: string,
    @Body(new ParseArrayPipe({ items: OptionItemDto })) body: OptionItemDto[],
    @CurrentUser() user: PublicUser,
  ): Promise<QuestionOption[]> {
    return this.options.replace(requireQuestionId(questionId), user.id, body)
  }
}
