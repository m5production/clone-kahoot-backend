import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { RequestIdMiddleware } from './common/middleware/request-id.middleware'
import { RequestLogMiddleware } from './common/middleware/request-log.middleware'
import { appConfig } from './config/configuration'
import { PrismaModule } from './database/prisma.module'
import { AcceptedAnswersModule } from './modules/accepted-answers/accepted-answers.module'
import { ActiveGameModule } from './modules/active-game/active-game.module'
import { AuthModule } from './modules/auth/auth.module'
import { GamesModule } from './modules/games/games.module'
import { HealthModule } from './modules/health/health.module'
import { HistoryModule } from './modules/history/history.module'
import { OptionsModule } from './modules/options/options.module'
import { QuestionsModule } from './modules/questions/questions.module'
import { UsersModule } from './modules/users/users.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    PrismaModule,
    AuthModule,
    UsersModule,
    GamesModule,
    QuestionsModule,
    AcceptedAnswersModule,
    OptionsModule,
    ActiveGameModule,
    HealthModule,
    HistoryModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, RequestLogMiddleware).forRoutes('{*path}')
  }
}
