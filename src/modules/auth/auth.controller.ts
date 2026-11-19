import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common'
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'
import { CurrentUser, SessionToken } from '../../common/decorators/current-user.decorator'
import { AuthGuard } from '../../common/guards/auth.guard'
import { RateLimit } from '../../common/guards/rate-limit.guard'
import { AuthService, type PublicUser } from './auth.service'

class CredentialsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(128)
  password!: string
}

interface AuthResponse {
  id: string
  name: string
  token: string
}

const toAuthResponse = ({ user, token }: { user: PublicUser; token: string }): AuthResponse => ({
  id: user.id,
  name: user.name,
  token,
})

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('users')
  @UseGuards(RateLimit(20, 60))
  register(@Body() dto: CredentialsDto): Promise<AuthResponse> {
    return this.auth.register(dto.name, dto.password).then(toAuthResponse)
  }

  @Post('users/auth')
  @HttpCode(200)
  @UseGuards(RateLimit(10, 60))
  login(@Body() dto: CredentialsDto): Promise<AuthResponse> {
    return this.auth.login(dto.name, dto.password).then(toAuthResponse)
  }

  @Post('users/logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  logout(@SessionToken() token: string): Promise<void> {
    return this.auth.logout(token)
  }

  @Get('users/me')
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user
  }

  @Post('auth/ws-ticket')
  @UseGuards(AuthGuard)
  wsTicket(@CurrentUser() user: PublicUser): { ticket: string } {
    return { ticket: this.auth.issueWsTicket(user.id) }
  }
}
