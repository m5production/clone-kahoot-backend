import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { GamesModule } from '../games/games.module'
import { AcceptedAnswersController } from './accepted-answers.controller'
import { AcceptedAnswersService } from './accepted-answers.service'

@Module({
  imports: [AuthModule, GamesModule],
  controllers: [AcceptedAnswersController],
  providers: [AcceptedAnswersService],
})
export class AcceptedAnswersModule {}
