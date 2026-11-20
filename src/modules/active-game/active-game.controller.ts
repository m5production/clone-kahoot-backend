import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthGuard } from '../../common/guards/auth.guard'
import type { PublicUser } from '../auth/auth.service'
import { ActiveGameService, type SessionSummary } from './active-game.service'

@Controller()
@UseGuards(AuthGuard)
export class ActiveGameController {
  constructor(private readonly activeGame: ActiveGameService) {}

  // FR-60: launching a quiz creates a session and opens its lobby
  @Post('games/:id/sessions')
  createSession(
    @Param('id') gameId: string,
    @CurrentUser() user: PublicUser,
  ): Promise<{ sessionId: string; joinPath: string }> {
    return this.activeGame.createSession(gameId, user.id)
  }

  // FR-73: public summary for the /join/:id page; ended sessions answer 410
  @Get('sessions/:id')
  sessionSummary(@Param('id') sessionId: string): SessionSummary {
    return this.activeGame.getSessionSummary(sessionId)
  }
}
