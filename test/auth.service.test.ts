import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConflictException, UnauthorizedException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CredentialsDto } from '../src/modules/auth/dto/credentials.dto'
import { AuthService } from '../src/modules/auth/auth.service'
import { hashPassword } from '../src/modules/auth/password.util'

const validateCredentials = (input: unknown) => validate(plainToInstance(CredentialsDto, input))

test('CredentialsDto trims the name and enforces 3-20 characters', async () => {
  assert.deepEqual(await validateCredentials({ name: '  alice  ', password: 'password1' }), [])
  assert.equal((await validateCredentials({ name: 'ab', password: 'password1' })).length, 1)
  assert.equal((await validateCredentials({ name: '  x  ', password: 'password1' })).length, 1)
  assert.deepEqual(await validateCredentials({ name: 'a'.repeat(20), password: 'password1' }), [])
  assert.equal(
    (await validateCredentials({ name: 'a'.repeat(21), password: 'password1' })).length,
    1,
  )
})

test('CredentialsDto enforces a password of 8-128 characters', async () => {
  assert.equal((await validateCredentials({ name: 'alice', password: '1234567' })).length, 1)
  assert.deepEqual(await validateCredentials({ name: 'alice', password: '12345678' }), [])
  assert.deepEqual(await validateCredentials({ name: 'alice', password: 'p'.repeat(128) }), [])
  assert.equal((await validateCredentials({ name: 'alice', password: 'p'.repeat(129) })).length, 1)
})

const configStub = { getOrThrow: () => ({ sessionTtlSeconds: 3600, wsTicketTtlSeconds: 30 }) }

const setup = (user: {
  create: (...args: never[]) => unknown
  findUnique: (...args: never[]) => unknown
}) => {
  const prismaStub = { user, session: { create: async () => ({}) } }
  return new AuthService(prismaStub as any, configStub as any)
}

test('register returns a user with a token', async () => {
  const service = setup({
    create: async () => ({ id: 'u1', name: 'alice' }),
    findUnique: async () => null,
  })

  const result = await service.register('alice', 'password1')
  assert.deepEqual(result.user, { id: 'u1', name: 'alice' })
  assert.ok(result.token.length > 0)
})

test('register maps a unique violation to a 409 conflict', async () => {
  const service = setup({
    create: async () => {
      const error = new Error('Unique constraint failed')
      ;(error as any).code = 'P2002'
      throw error
    },
    findUnique: async () => null,
  })

  await assert.rejects(service.register('ALICE', 'password1'), ConflictException)
})

test('login rejects an unknown name and a wrong password with the same message', async () => {
  const stored = {
    id: 'u1',
    name: 'alice',
    passwordHash: await hashPassword('right-password'),
  }
  const findUnique = async ({ where: { name } }: any) => (name === 'alice' ? stored : null)
  const service = setup({ create: async () => null, findUnique })

  const unknownName = await service.login('bob', 'whatever-password').then(
    () => null,
    (error) => error,
  )
  const wrongPassword = await service.login('alice', 'wrong-password').then(
    () => null,
    (error) => error,
  )

  assert.ok(unknownName instanceof UnauthorizedException)
  assert.ok(wrongPassword instanceof UnauthorizedException)
  assert.equal(unknownName.message, 'Invalid name or password')
  assert.equal(wrongPassword.message, 'Invalid name or password')
})

test('login returns a token for the right credentials', async () => {
  const stored = {
    id: 'u1',
    name: 'alice',
    passwordHash: await hashPassword('right-password'),
  }
  const service = setup({
    create: async () => null,
    findUnique: async () => stored,
  })

  const result = await service.login('alice', 'right-password')
  assert.deepEqual(result.user, { id: 'u1', name: 'alice' })
  assert.ok(result.token.length > 0)
})
