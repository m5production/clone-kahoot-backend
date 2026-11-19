import type { IncomingMessage } from 'node:http'
import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { plainToInstance } from 'class-transformer'
import { IsNotEmpty, IsString, MaxLength, validateSync } from 'class-validator'
import type { WebSocket, WebSocketServer as WsServer } from 'ws'
import type { AppConfig } from '../../config/configuration'
import { AuthService } from '../auth/auth.service'
import { ActiveGameService, GameFault } from './active-game.service'

class GameIdDto {
  @IsString()
  @IsNotEmpty()
  gameId!: string
}

class ChangeQuestionDto {
  @IsString()
  @IsNotEmpty()
  questionId!: string
}

class AnswerQuestionDto {
  @IsString()
  @IsNotEmpty()
  questionId!: string

  @IsString()
  @MaxLength(200)
  answer!: string
}

const KNOWN_EVENTS = new Set([
  'START_GAME',
  'PLAYER_CONNECTED',
  'CHANGE_QUESTION',
  'ANSWER_QUESTION',
  'SHOW_ANSWERS',
  'SHOW_WINNERS',
  'END_GAME',
])

const parseBody = <T extends object>(cls: new () => T, body: unknown): T => {
  const dto = plainToInstance(cls, body, { excludeExtraneousValues: false })
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })
  if (errors.length > 0) {
    throw new GameFault('BAD_REQUEST', 'Invalid message payload')
  }
  return dto
}

@WebSocketGateway({ path: '/ws', maxPayload: 16384 })
export class ActiveGameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ActiveGameGateway.name)
  private heartbeat?: NodeJS.Timeout

  @WebSocketServer()
  server!: WsServer

  constructor(
    private readonly activeGame: ActiveGameService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: WsServer): void {
    this.heartbeat = setInterval(() => {
      for (const client of server.clients as Set<WebSocket & { isAlive?: boolean }>) {
        if (client.isAlive === false) {
          client.terminate()
          continue
        }
        client.isAlive = false
        try {
          client.ping()
        } catch {
          client.terminate()
        }
      }
    }, 30_000)
    this.heartbeat.unref?.()
  }

  handleConnection(client: WebSocket & { isAlive?: boolean }, request: IncomingMessage): void {
    const origins = this.config.getOrThrow<AppConfig>('app').allowedOrigins
    const origin = request.headers.origin
    if (origin && !origins.includes(origin)) {
      client.close(4403, 'Forbidden origin')
      return
    }
    const url = new URL(request.url ?? '/', 'http://localhost')
    const userId = this.auth.consumeWsTicket(url.searchParams.get('ticket') ?? undefined)
    if (!userId) {
      client.close(4401, 'Invalid or expired ticket')
      return
    }
    client.isAlive = true
    client.on('pong', () => {
      client.isAlive = true
    })
    client.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString())
        if (typeof message?.type !== 'string' || !KNOWN_EVENTS.has(message.type)) {
          this.activeGame.sendFault(client, new GameFault('UNKNOWN_EVENT', 'Unknown event type'))
        }
      } catch {
        this.activeGame.sendFault(client, new GameFault('BAD_REQUEST', 'Invalid JSON message'))
      }
    })
    this.activeGame.registerClient(client, userId)
  }

  handleDisconnect(client: WebSocket): void {
    this.activeGame.unregisterClient(client)
  }

  @SubscribeMessage('START_GAME')
  startGame(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown): void {
    this.run(client, () => this.activeGame.startGame(client, parseBody(GameIdDto, body).gameId))
  }

  @SubscribeMessage('PLAYER_CONNECTED')
  joinGame(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown): void {
    this.run(client, () => this.activeGame.joinGame(client, parseBody(GameIdDto, body).gameId))
  }

  @SubscribeMessage('CHANGE_QUESTION')
  changeQuestion(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown): void {
    this.run(client, () =>
      this.activeGame.changeQuestion(client, parseBody(ChangeQuestionDto, body).questionId),
    )
  }

  @SubscribeMessage('ANSWER_QUESTION')
  answerQuestion(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown): void {
    this.run(client, () => {
      const dto = parseBody(AnswerQuestionDto, body)
      this.activeGame.answerQuestion(client, dto.questionId, dto.answer)
    })
  }

  @SubscribeMessage('SHOW_ANSWERS')
  showAnswers(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown): void {
    this.run(client, () =>
      this.activeGame.showAnswers(client, parseBody(ChangeQuestionDto, body).questionId),
    )
  }

  @SubscribeMessage('SHOW_WINNERS')
  showWinners(@ConnectedSocket() client: WebSocket): void {
    this.run(client, () => this.activeGame.showWinners(client))
  }

  @SubscribeMessage('END_GAME')
  endGame(@ConnectedSocket() client: WebSocket): void {
    this.run(client, () => this.activeGame.endGame(client))
  }

  private run(client: WebSocket, fn: () => void | Promise<unknown>): void {
    Promise.resolve()
      .then(fn)
      .catch((error) => this.activeGame.sendFault(client, error))
  }
}
