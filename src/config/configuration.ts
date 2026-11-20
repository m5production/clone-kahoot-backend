import { registerAs } from '@nestjs/config'

const required = (env: NodeJS.ProcessEnv, key: string): string => {
  const value = env[key]
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

const int = (value: string, key: string): number => {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${key} must be a positive integer, got: ${value}`)
  }
  return parsed
}

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error(`Expected 'true' or 'false', got: ${value}`)
}

const resolveDatabaseUrl = (env: NodeJS.ProcessEnv): string => {
  const host = required(env, 'DB_HOST').trim()
  const user = required(env, 'DB_USER')
  const password = required(env, 'DB_PASSWORD')
  const name = required(env, 'DB_NAME')
  const port = int(env.DB_PORT ?? '5432', 'DB_PORT')
  const sslmode = env.DB_SSLMODE?.trim()

  const credentials = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
  const database = encodeURIComponent(name)
  return `postgresql://${credentials}@${host}:${port}/${database}${sslmode ? `?sslmode=${encodeURIComponent(sslmode)}` : ''}`
}

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  host: string
  port: number
  databaseUrl: string
  allowedOrigins: string[]
  trustProxy: boolean
  sessionTtlSeconds: number
  wsTicketTtlSeconds: number
  httpBodyLimit: string
  wsPayloadLimit: number
}

export const appConfig = registerAs('app', (): AppConfig => {
  const env = process.env
  const nodeEnv = (env.NODE_ENV ?? 'development') as AppConfig['nodeEnv']
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error(`NODE_ENV must be development, test or production, got: ${nodeEnv}`)
  }

  const databaseUrl = resolveDatabaseUrl(env)

  const allowedOrigins = required(env, 'ALLOWED_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (allowedOrigins.length === 0) {
    throw new Error('ALLOWED_ORIGINS must contain at least one origin')
  }

  return {
    nodeEnv,
    host: env.HOST ?? '0.0.0.0',
    port: int(env.PORT ?? '3000', 'PORT'),
    databaseUrl,
    allowedOrigins,
    trustProxy: bool(env.TRUST_PROXY, nodeEnv === 'production'),
    sessionTtlSeconds: int(env.SESSION_TTL_SECONDS ?? '2592000', 'SESSION_TTL_SECONDS'),
    wsTicketTtlSeconds: int(env.WS_TICKET_TTL_SECONDS ?? '30', 'WS_TICKET_TTL_SECONDS'),
    httpBodyLimit: env.HTTP_BODY_LIMIT ?? '64kb',
    wsPayloadLimit: int(env.WS_PAYLOAD_LIMIT ?? '16384', 'WS_PAYLOAD_LIMIT'),
  }
})
