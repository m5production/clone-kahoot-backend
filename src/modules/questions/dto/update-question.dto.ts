import { Transform } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { trimString } from '../../../common/transforms'
import { TIME_LIMITS_SEC } from '../question.constants'

export class UpdateQuestionDto {
  @Transform(trimString)
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
