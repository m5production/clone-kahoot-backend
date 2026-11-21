import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { HistoryController } from './history.controller'
import { HistoryService } from './history.service'

@Module({
  controllers: [HistoryController],
  imports: [AuthModule],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
