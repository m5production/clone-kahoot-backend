import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Type,
  HttpException,
  HttpStatus,
  mixin,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import type { AppConfig } from '../../config/configuration'

const buckets = new Map<string, { count: number; resetAt: number }>()

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key)
}, 60_000).unref()

export const RateLimit = (limit: number, windowSeconds: number): Type<CanActivate> => {
  @Injectable()
  class RateLimitGuard implements CanActivate {
    constructor(private readonly config: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
      // E2E/test environments issue many authenticated calls from one client
      if (this.config.getOrThrow<AppConfig>('app').nodeEnv === 'test') return true
      const req = context.switchToHttp().getRequest<Request>()
      const key = `${req.ip}:${req.path}`
      const now = Date.now()
      const bucket = buckets.get(key)
      if (!bucket || bucket.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
        return true
      }
      bucket.count += 1
      if (bucket.count > limit) {
        throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS)
      }
      return true
    }
  }
  return mixin(RateLimitGuard)
}
