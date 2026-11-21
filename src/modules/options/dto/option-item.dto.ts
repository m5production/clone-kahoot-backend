import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class OptionItemDto {
  // BR-86: 1-100 chars per option; the service also rejects blanks and duplicates
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  text!: string

  @IsBoolean()
  isCorrect!: boolean
}
