import type { WebSocket } from 'ws'

type Bucket = { count: number; resetAt: number }

/**
 * Per-connection fixed-window limiter for game commands. A socket is the
 * identity: a reconnecting client starts a fresh bucket. The caller decides
 * whether it is enabled — tests construct it with enabled=false, same as
 * the HTTP RateLimit guard is bypassed in test env.
 */
export class WsCommandLimiter {
  private readonly buckets = new WeakMap<WebSocket, Bucket>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly enabled: boolean,
  ) {}

  /** true — the command is within the limit; false — it must be rejected */
  hit(client: WebSocket, now = Date.now()): boolean {
    if (!this.enabled) return true
    const bucket = this.buckets.get(client)
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(client, { count: 1, resetAt: now + this.windowMs })
      return true
    }
    bucket.count += 1
    return bucket.count <= this.limit
  }
}
