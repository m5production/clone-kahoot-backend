import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { WebSocket } from 'ws'
import { WsCommandLimiter } from '../src/common/ws-command-limiter'

const client = () => ({}) as WebSocket

describe('WsCommandLimiter', () => {
  it('allows commands within the window and rejects the flood', () => {
    const limiter = new WsCommandLimiter(3, 10_000)
    const ws = client()
    assert.equal(limiter.hit(ws, 0), true)
    assert.equal(limiter.hit(ws, 1), true)
    assert.equal(limiter.hit(ws, 2), true)
    assert.equal(limiter.hit(ws, 3), false)
    assert.equal(limiter.hit(ws, 9_999), false)
    // the next window resets the bucket
    assert.equal(limiter.hit(ws, 10_000), true)
  })

  it('limits each socket independently', () => {
    const limiter = new WsCommandLimiter(1, 10_000)
    assert.equal(limiter.hit(client(), 0), true)
    assert.equal(limiter.hit(client(), 0), true)
  })

  it('is disabled outside of production-like envs (test e2e compatibility)', () => {
    const limiter = new WsCommandLimiter(1, 10_000, false)
    const ws = client()
    for (let i = 0; i < 100; i++) assert.equal(limiter.hit(ws, i), true)
  })
})
