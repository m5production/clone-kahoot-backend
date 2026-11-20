import { Module } from '@nestjs/common'
import { ActiveGameModule } from '../active-game/active-game.module'
import { AuthModule } from '../auth/auth.module'
import { GamesController } from './games.controller'
import { GamesService } from './games.service'

@Module({
  imports: [AuthModule, ActiveGameModule],
  controllers: [GamesController],
  providers: [GamesService],
  exports: [GamesService],
})
export class GamesModule {}
