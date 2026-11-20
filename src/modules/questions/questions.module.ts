import { Module } from '@nestjs/common'
import { ActiveGameModule } from '../active-game/active-game.module'
import { AuthModule } from '../auth/auth.module'
import { GamesModule } from '../games/games.module'
import { QuestionsController } from './questions.controller'
import { QuestionsService } from './questions.service'

@Module({
  imports: [AuthModule, GamesModule, ActiveGameModule],
  controllers: [QuestionsController],
  providers: [QuestionsService],
})
export class QuestionsModule {}
