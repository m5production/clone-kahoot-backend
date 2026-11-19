import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appConfig } from '../src/config/configuration'

const load = (env: Record<string, string>) => {
  const saved = { ...process.env }
  process.env = env as NodeJS.ProcessEnv
  try {
    return (appConfig as unknown as () => unknown)()
  } finally {
    process.env = saved
  }
}

const valid = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  ALLOWED_ORIGINS: 'http://localhost:5173',
  PORT: '3000',
}

test('valid configuration loads with defaults', () => {
  const config = load(valid) as any
  assert.equal(config.port, 3000)
  assert.equal(config.nodeEnv, 'test')
  assert.equal(config.trustProxy, false)
  assert.deepEqual(config.allowedOrigins, ['http://localhost:5173'])
})

test('missing or invalid configuration is rejected', () => {
  assert.throws(() => load({ ...valid, DATABASE_URL: 'file:./dev.db' }), /PostgreSQL/)
  assert.throws(() => load({ ...valid, DATABASE_URL: '' }), /DATABASE_URL/)
  assert.throws(() => load({ ...valid, NODE_ENV: 'bogus' }), /NODE_ENV/)
  assert.throws(() => load({ ...valid, PORT: 'abc' }), /PORT/)
  assert.throws(() => load({ ...valid, ALLOWED_ORIGINS: ' ' }), /ALLOWED_ORIGINS/)
})

test('production defaults to trusting proxy', () => {
  const config = load({ ...valid, NODE_ENV: 'production' }) as any
  assert.equal(config.trustProxy, true)
})
