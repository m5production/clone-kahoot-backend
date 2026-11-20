import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { WsAdapter } from '@nestjs/platform-ws'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { json } from 'express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/filters/http-exception.filter'
import type { AppConfig } from './config/configuration'

export const createApp = async (): Promise<NestExpressApplication> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  })
  const config = app.get(ConfigService)
  const appConfig = config.getOrThrow<AppConfig>('app')

  app.setGlobalPrefix('api')
  app.useWebSocketAdapter(
    new WsAdapter(app, {
      // protocol: client sends {type, payload}; adapter internally expects {event, data}
      messageParser: (raw: { toString(): string }) => {
        const message = JSON.parse(raw.toString())
        if (typeof message?.type !== 'string') throw new Error('Invalid message format')
        return { event: message.type, data: message.payload }
      },
    }),
  )
  app.use(helmet())
  app.use(json({ limit: appConfig.httpBodyLimit }))
  app.enableCors({
    origin: appConfig.allowedOrigins,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
  if (appConfig.trustProxy) app.set('trust proxy', 1)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  )
  app.useGlobalFilters(new HttpExceptionFilter())

  // Interactive OpenAPI docs are a development tool; in production only the JSON
  // schema is served at /api/openapi.json
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('clone-kahoot backend')
      .setDescription('Quiz backend: REST API under /api, game WebSocket at /ws')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  )
  if (appConfig.nodeEnv !== 'production') {
    SwaggerModule.setup('api/docs', app, document)
  }
  app
    .getHttpAdapter()
    .getInstance()
    .get('/api/openapi.json', (_req: unknown, res: { json(body: unknown): void }) =>
      res.json(document),
    )

  app.enableShutdownHooks()
  return app
}
