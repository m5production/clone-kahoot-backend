import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hashPassword, verifyPassword } from '../src/modules/auth/password.util'

test('hashPassword produces verifiable scrypt hash', async () => {
  const hash = await hashPassword('secret')
  assert.match(hash, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/)
  assert.equal(await verifyPassword('secret', hash), true)
})

test('verifyPassword rejects wrong password and malformed hash', async () => {
  const hash = await hashPassword('secret')
  assert.equal(await verifyPassword('wrong', hash), false)
  assert.equal(await verifyPassword('secret', 'not-a-hash'), false)
})

test('hashes are salted', async () => {
  assert.notEqual(await hashPassword('same'), await hashPassword('same'))
})
