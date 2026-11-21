import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { trimString } from '../../../common/transforms'
import { QUESTION_TYPES, type QuestionType, TIME_LIMITS_SEC } from '../question.constants'

export class UpdateQuestionDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  text!: string

  // the value reaches <img src> on every player's screen — allow only http(s)
  // URLs and inline images so file:/javascript:/tracking schemes cannot be
  // smuggled in (data: images do not issue requests and cannot run scripts)
  @IsOptional()
  @IsString()
  @Matches(/^(https?:\/\/|data:image\/)/i)
  @MaxLength(2048)
  img?: string | null

  // BR-48
  @IsOptional()
  @IsInt()
  @IsIn(TIME_LIMITS_SEC)
  timeLimitSec?: number

  // D-10: switching the type drops the data of the other type (D-12)
  @IsOptional()
  @IsIn(QUESTION_TYPES)
  type?: QuestionType
}
