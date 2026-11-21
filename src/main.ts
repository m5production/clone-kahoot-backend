import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createApp } from './bootstrap'
import type { AppConfig } from './config/configuration'

const SHUTDOWN_TIMEOUT_MS = 10_000

const main = async (): Promise<void> => {
  const app = await createApp()
  const config = app.get(ConfigService).getOrThrow<AppConfig>('app')
  const logger = new Logger('Bootstrap')

  await app.listen(config.port, config.host)
  logger.log(`Server running on ${config.host}:${config.port}`)

  // enableShutdownHooks (in createApp) already closes the app on these
  // signals; the manual handlers exist for the force-exit timer, and
  // calling close() a second time is safe
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logger.log(`Received ${signal}, shutting down`)
      const timer = setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS)
      timer.unref()
      app.close().finally(() => process.exit(0))
    })
  }
}

void main()
