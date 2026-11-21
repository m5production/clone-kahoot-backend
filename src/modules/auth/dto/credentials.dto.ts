import { Transform } from 'class-transformer'
import { IsString, MaxLength, MinLength } from 'class-validator'
import { trimString } from '../../../common/transforms'

// BR-40, BR-41
export class CredentialsDto {
  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  name!: string

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string
}
