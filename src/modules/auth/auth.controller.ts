import { Controller, Post, UseGuards } from '@nestjs/common'
import { AuthGuard } from './auth.guard'
import { CurrentUser } from './current-user.decorator'
import { AuthService, type PublicUser } from './auth.service'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('ws-ticket')
  @UseGuards(AuthGuard)
  wsTicket(@CurrentUser() user: PublicUser): { ticket: string } {
    return { ticket: this.auth.issueWsTicket(user.id) }
  }
}
