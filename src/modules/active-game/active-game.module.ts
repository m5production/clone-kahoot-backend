import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ActiveGameController } from './active-game.controller'
import { ActiveGameGateway } from './active-game.gateway'
import { ActiveGameService } from './active-game.service'

@Module({
  imports: [AuthModule],
  controllers: [ActiveGameController],
  providers: [ActiveGameService, ActiveGameGateway],
  exports: [ActiveGameService],
})
export class ActiveGameModule {}
