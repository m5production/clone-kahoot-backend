import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'
import { TIME_LIMITS_SEC } from '../question.constants'

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  gameId!: string

  // A new question is a placeholder: the editor fills its text afterwards (BR-46)
  @IsString()
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
}
