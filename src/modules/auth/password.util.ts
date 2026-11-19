import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>

const KEY_LENGTH = 64

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString('hex')
  const hash = await scrypt(password, salt, KEY_LENGTH)
  return `scrypt:${salt}:${hash.toString('hex')}`
}

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const hash = await scrypt(password, parts[1], KEY_LENGTH)
  const expected = Buffer.from(parts[2], 'hex')
  return hash.length === expected.length && timingSafeEqual(hash, expected)
}
