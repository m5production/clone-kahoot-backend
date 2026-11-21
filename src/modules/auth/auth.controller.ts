import { Controller, Post, UseGuards } from '@nestjs/common'
import { RateLimit } from '../../common/guards/rate-limit.guard'
import { AuthGuard } from './auth.guard'
import { CurrentUser } from './current-user.decorator'
import { AuthService, type PublicUser } from './auth.service'

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // a ticket is required per socket; the limit still leaves headroom for the
  // client's 2 s reconnect loop while bounding connection-churn abuse
  @Post('ws-ticket')
  @UseGuards(AuthGuard, RateLimit(60, 60))
  wsTicket(@CurrentUser() user: PublicUser): { ticket: string } {
    return { ticket: this.auth.issueWsTicket(user.id) }
  }
}
