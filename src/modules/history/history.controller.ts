import { Controller, Delete, Get, HttpCode, Param, Query, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../auth/current-user.decorator'
import { AuthGuard } from '../auth/auth.guard'
import type { PublicUser } from '../auth/auth.service'
import { HistoryService } from './history.service'

@Controller('sessions')
@UseGuards(AuthGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  // FR-80: the host's history; ?gameId= narrows it to one quiz (FR-83)
  @Get()
  list(@CurrentUser() user: PublicUser, @Query('gameId') gameId?: string) {
    return this.history.listHistory(user.id, gameId)
  }

  // FR-81: a full report — standings plus every answer per question
  @Get(':id/report')
  report(@Param('id') sessionId: string, @CurrentUser() user: PublicUser) {
    return this.history.getReport(sessionId, user.id)
  }

  // FR-82, BR-82: deleting a record is allowed to the host only
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') sessionId: string, @CurrentUser() user: PublicUser) {
    return this.history.deleteRecord(sessionId, user.id)
  }
}
