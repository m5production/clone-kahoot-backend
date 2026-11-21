import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { TIME_LIMITS_SEC } from '../question.constants'

export class CreateQuestionDto {
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

  // BR-48
  @IsOptional()
  @IsInt()
  @IsIn(TIME_LIMITS_SEC)
  timeLimitSec?: number
}
