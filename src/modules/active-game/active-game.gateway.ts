import type { IncomingMessage } from 'node:http'
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
import { WsCommandLimiter } from '../../common/ws-command-limiter'
import type { AppConfig } from '../../config/configuration'
import { AuthService } from '../auth/auth.service'
import { ActiveGameService, GameFault } from './active-game.service'

class JoinSessionDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string
}

class AnswerQuestionDto {
  @IsString()
  @IsNotEmpty()
  questionId!: string

  @IsString()
  @MaxLength(100)
  answer!: string
}

const KNOWN_EVENTS = new Set([
  'JOIN_SESSION',
  'START_GAME',
  'NEXT_QUESTION',
  'CLOSE_QUESTION',
  'SHOW_ANSWERS',
  'SHOW_WINNERS',
  'END_SESSION',
  'ANSWER_QUESTION',
])

const parseBody = <T extends object>(cls: new () => T, body: unknown): T => {
  const dto = plainToInstance(cls, body, { excludeExtraneousValues: false })
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })
  if (errors.length > 0) {
    throw new GameFault('BAD_REQUEST', 'Invalid message payload')
  }
  return dto
}

@WebSocketGateway({ path: '/ws' })
export class ActiveGameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private heartbeat?: NodeJS.Timeout

  // BR-adjacent hardening: a socket may send at most 30 commands per 10 s —
  // a normal game issues a handful per question, floods are rejected
  private readonly commandLimiter = new WsCommandLimiter(30, 10_000)

  @WebSocketServer()
  server!: WsServer

  constructor(
    private readonly activeGame: ActiveGameService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: WsServer): void {
    // the decorator options are static, so the configured payload limit is
    // applied here — ws reads it from server.options on every upgrade
    server.options.maxPayload = this.config.getOrThrow<AppConfig>('app').wsPayloadLimit
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
          // unknown/invalid frames never reach run() — they need their own limit
          const fault = this.commandLimiter.hit(client)
            ? new GameFault('UNKNOWN_EVENT', 'Unknown event type')
            : new GameFault('RATE_LIMITED', 'Too many commands, slow down')
          this.activeGame.sendFault(client, fault)
        }
      } catch {
        const fault = this.commandLimiter.hit(client)
          ? new GameFault('BAD_REQUEST', 'Invalid JSON message')
          : new GameFault('RATE_LIMITED', 'Too many commands, slow down')
        this.activeGame.sendFault(client, fault)
      }
    })
    this.activeGame.registerClient(client, userId)
  }

  handleDisconnect(client: WebSocket): void {
    this.activeGame.unregisterClient(client)
  }

  @SubscribeMessage('JOIN_SESSION')
  joinSession(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown): void {
    this.run(client, () =>
      this.activeGame.joinSession(client, parseBody(JoinSessionDto, body).sessionId),
    )
  }

  @SubscribeMessage('START_GAME')
  startGame(@ConnectedSocket() client: WebSocket): void {
    this.run(client, () => this.activeGame.startGame(client))
  }

  @SubscribeMessage('NEXT_QUESTION')
  nextQuestion(@ConnectedSocket() client: WebSocket): void {
    this.run(client, () => this.activeGame.nextQuestion(client))
  }

  @SubscribeMessage('CLOSE_QUESTION')
  closeQuestion(@ConnectedSocket() client: WebSocket): void {
    this.run(client, () => this.activeGame.closeQuestion(client))
  }

  @SubscribeMessage('SHOW_ANSWERS')
  showAnswers(@ConnectedSocket() client: WebSocket): void {
    this.run(client, () => this.activeGame.showAnswers(client))
  }

  @SubscribeMessage('SHOW_WINNERS')
  showWinners(@ConnectedSocket() client: WebSocket): void {
    this.run(client, () => this.activeGame.showWinners(client))
  }

  @SubscribeMessage('END_SESSION')
  endSession(@ConnectedSocket() client: WebSocket): void {
    this.run(client, () => this.activeGame.endSession(client))
  }

  @SubscribeMessage('ANSWER_QUESTION')
  answerQuestion(@ConnectedSocket() client: WebSocket, @MessageBody() body: unknown): void {
    this.run(client, () => {
      const dto = parseBody(AnswerQuestionDto, body)
      this.activeGame.answerQuestion(client, dto.questionId, dto.answer)
    })
  }

  private run(client: WebSocket, fn: () => unknown): void {
    if (!this.commandLimiter.hit(client)) {
      this.activeGame.sendFault(
        client,
        new GameFault('RATE_LIMITED', 'Too many commands, slow down'),
      )
      return
    }
    Promise.resolve()
      .then(fn)
      .catch((error) => this.activeGame.sendFault(client, error))
  }
}
