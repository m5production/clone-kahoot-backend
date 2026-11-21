import { Module } from '@nestjs/common'
import { ActiveGameModule } from '../active-game/active-game.module'
import { AuthModule } from '../auth/auth.module'
import { GamesModule } from '../games/games.module'
import { OptionsController } from './options.controller'
import { OptionsService } from './options.service'

@Module({
  imports: [AuthModule, GamesModule, ActiveGameModule],
  controllers: [OptionsController],
  providers: [OptionsService],
})
export class OptionsModule {}
