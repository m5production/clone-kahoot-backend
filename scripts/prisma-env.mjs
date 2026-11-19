import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const required = (key) => {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

const resolveDatabaseUrl = () => {
  const host = required('DB_HOST')
  const port = process.env.DB_PORT?.trim() || '5432'
  const sslmode = process.env.DB_SSLMODE?.trim()
  const parsedPort = Number.parseInt(port, 10)
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error(`Environment variable DB_PORT must be a positive integer, got: ${port}`)
  }
  const credentials = `${encodeURIComponent(required('DB_USER'))}:${encodeURIComponent(required('DB_PASSWORD'))}`
  const database = encodeURIComponent(required('DB_NAME'))
  return `postgresql://${credentials}@${host}:${parsedPort}/${database}${sslmode ? `?sslmode=${encodeURIComponent(sslmode)}` : ''}`
}

const [, , command, ...args] = process.argv
if (!command) throw new Error('Missing Prisma command')

process.env.DATABASE_URL = resolveDatabaseUrl()

let executable
if (command === 'tsx') {
  executable = process.platform === 'win32' ? 'node_modules/.bin/tsx.cmd' : 'node_modules/.bin/tsx'
} else {
  executable = process.platform === 'win32' ? 'node_modules/.bin/prisma.cmd' : 'node_modules/.bin/prisma'
  args.unshift(command)
}

if (!existsSync(executable)) throw new Error(`Executable not found: ${executable}`)

const child = spawn(executable, args, { stdio: 'inherit', env: process.env })
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
