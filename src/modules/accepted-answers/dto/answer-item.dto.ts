import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class AnswerItemDto {
  // BR-47: 1-100 chars per answer; the service also rejects blanks and duplicates
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  text!: string
}
