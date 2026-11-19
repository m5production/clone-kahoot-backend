import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import type { Question } from '@prisma/client'
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthGuard } from '../../common/guards/auth.guard'
import type { PublicUser } from '../auth/auth.service'
import { QuestionsService } from './questions.service'

class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  gameId!: string

  // A new question is a placeholder: the editor fills its text afterwards
  @IsString()
  @MaxLength(500)
  text!: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  img?: string | null
}

class UpdateQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  text!: string

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  img?: string | null
}

@Controller('questions')
@UseGuards(AuthGuard)
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get()
  list(@Query('gameId') gameId: string, @CurrentUser() user: PublicUser): Promise<Question[]> {
    return this.questions.listForGame(gameId, user.id)
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: PublicUser): Promise<Question> {
    return this.questions.get(id, user.id)
  }

  @Post()
  create(@Body() dto: CreateQuestionDto, @CurrentUser() user: PublicUser): Promise<Question> {
    return this.questions.create(user.id, dto)
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
    @CurrentUser() user: PublicUser,
  ): Promise<Question> {
    return this.questions.update(id, user.id, dto)
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: PublicUser): Promise<Question> {
    return this.questions.delete(id, user.id)
  }
}
