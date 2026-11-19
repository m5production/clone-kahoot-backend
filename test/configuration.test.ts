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
  DB_HOST: 'localhost',
  DB_USER: 'u',
  DB_PASSWORD: 'p',
  DB_NAME: 'db',
  ALLOWED_ORIGINS: 'http://localhost:5173',
  PORT: '3000',
}

test('valid configuration loads with defaults', () => {
  const config = load(valid) as any
  assert.equal(config.port, 3000)
  assert.equal(config.nodeEnv, 'test')
  assert.equal(config.trustProxy, false)
  assert.equal(config.databaseUrl, 'postgresql://u:p@localhost:5432/db')
  assert.deepEqual(config.allowedOrigins, ['http://localhost:5173'])
})

test('missing or invalid configuration is rejected', () => {
  const env = { ...valid } as Record<string, string>
  delete env.DB_HOST
  assert.throws(() => load(env), /DB_HOST/)
  assert.throws(() => load({ ...valid, DB_USER: '' }), /DB_USER/)
  assert.throws(() => load({ ...valid, NODE_ENV: 'bogus' }), /NODE_ENV/)
  assert.throws(() => load({ ...valid, PORT: 'abc' }), /PORT/)
  assert.throws(() => load({ ...valid, ALLOWED_ORIGINS: ' ' }), /ALLOWED_ORIGINS/)
})

test('database url encodes credentials', () => {
  const config = load({
    ...valid,
    DB_HOST: 'cnpg-db-rw',
    DB_USER: 'u s',
    DB_PASSWORD: 'p@ss/word',
    DB_NAME: 'clone_kahoot',
  }) as any
  assert.equal(config.databaseUrl, 'postgresql://u%20s:p%40ss%2Fword@cnpg-db-rw:5432/clone_kahoot')
})

test('DB_PORT and DB_SSLMODE are applied and validated', () => {
  const config = load({ ...valid, DB_PORT: '6432', DB_SSLMODE: 'require' }) as any
  assert.equal(config.databaseUrl, 'postgresql://u:p@localhost:6432/db?sslmode=require')
  assert.throws(() => load({ ...valid, DB_PORT: 'abc' }), /DB_PORT/)
})

test('production defaults to trusting proxy', () => {
  const config = load({ ...valid, NODE_ENV: 'production' }) as any
  assert.equal(config.trustProxy, true)
})
