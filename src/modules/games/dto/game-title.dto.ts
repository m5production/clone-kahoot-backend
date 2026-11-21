import { Transform } from 'class-transformer'
import { IsString, Length } from 'class-validator'
import { trimString } from '../../../common/transforms'

export class GameTitleDto {
  // BR-44: title is required, 1-80 chars, trimmed
  @Transform(trimString)
  @IsString()
  @Length(1, 80)
  title!: string
}
