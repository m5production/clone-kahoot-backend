import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../../common/guards/auth.guard'
import { ActiveGameService } from './active-game.service'

@Controller('active-game')
@UseGuards(AuthGuard)
export class ActiveGameController {
  constructor(private readonly activeGame: ActiveGameService) {}

  @Get(':id')
  check(@Param('id') id: string): { running: boolean } {
    if (!this.activeGame.isGameRunning(id)) {
      throw new NotFoundException(`No game with id ${id} is currently running`)
    }
    return { running: true }
  }
}
