import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { User } from '@prisma/client'
import type { AppConfig } from '../../config/configuration'
import { PrismaService } from '../../database/prisma.service'
import { hashPassword, verifyPassword } from './password.util'

export interface PublicUser {
  id: string
  name: string
}

export const toPublicUser = ({ id, name }: User): PublicUser => ({ id, name })

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)
  private readonly tickets = new Map<string, { userId: string; expiresAt: number }>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async register(name: string, password: string): Promise<{ user: PublicUser; token: string }> {
    try {
      const user = await this.prisma.user.create({
        data: { name, passwordHash: await hashPassword(password) },
      })
      return { user: toPublicUser(user), token: await this.createSession(user.id) }
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('There is a user with such a name. Please make a unique name')
      }
      throw error
    }
  }

  async login(name: string, password: string): Promise<{ user: PublicUser; token: string }> {
    const user = await this.prisma.user.findUnique({ where: { name } })
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid name or password')
    }
    return { user: toPublicUser(user), token: await this.createSession(user.id) }
  }

  async authenticate(token: string | undefined): Promise<PublicUser | null> {
    if (!token) return null
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    })
    if (!session || session.revokedAt || session.expiresAt <= new Date()) return null
    return toPublicUser(session.user)
  }

  async logout(token: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  issueWsTicket(userId: string): string {
    const ticket = randomBytes(32).toString('base64url')
    const ttl = this.config.getOrThrow<AppConfig>('app').wsTicketTtlSeconds
    this.tickets.set(ticket, { userId, expiresAt: Date.now() + ttl * 1000 })
    return ticket
  }

  consumeWsTicket(ticket: string | undefined): string | null {
    if (!ticket) return null
    const entry = this.tickets.get(ticket)
    this.tickets.delete(ticket)
    if (!entry || entry.expiresAt <= Date.now()) return null
    return entry.userId
  }

  private createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url')
    const ttl = this.config.getOrThrow<AppConfig>('app').sessionTtlSeconds
    return this.prisma.session
      .create({
        data: {
          tokenHash: hashToken(token),
          userId,
          expiresAt: new Date(Date.now() + ttl * 1000),
        },
      })
      .then(() => token)
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
    )
  }
}
