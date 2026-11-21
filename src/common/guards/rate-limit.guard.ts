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

const hit = (key: string, limit: number, windowSeconds: number): boolean => {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return true
  }
  bucket.count += 1
  return bucket.count <= limit
}

/**
 * Fixed-window limiter. Every request passes three buckets:
 * - per-IP — the primary key, but req.ip is derived from X-Forwarded-For when
 *   TRUST_PROXY is on, so a client can rotate it;
 * - global — bounds the total rate of the route even under IP spoofing;
 * - extraKey — an optional second key (e.g. login name) that the client cannot
 *   spoof through headers, so credential stuffing is throttled per account.
 */
export const RateLimit = (
  limit: number,
  windowSeconds: number,
  extraKey?: (req: Request) => string | undefined,
): Type<CanActivate> => {
  @Injectable()
  class RateLimitGuard implements CanActivate {
    constructor(private readonly config: ConfigService) {}

    canActivate(context: ExecutionContext): boolean {
      // E2E/test environments issue many authenticated calls from one client
      if (this.config.getOrThrow<AppConfig>('app').nodeEnv === 'test') return true
      const req = context.switchToHttp().getRequest<Request>()
      const extra = extraKey?.(req)
      const allowed =
        hit(`${req.ip}:${req.path}`, limit, windowSeconds) &&
        hit(`*:${req.path}`, limit * 10, windowSeconds) &&
        (extra === undefined || hit(`${extra}:${req.path}`, limit, windowSeconds))
      if (!allowed) {
        throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS)
      }
      return true
    }
  }
  return mixin(RateLimitGuard)
}
