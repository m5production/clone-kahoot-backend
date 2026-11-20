import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeAnswer } from '../src/common/normalize-answer'

test('normalizeAnswer trims edges and lowercases (BR-64)', () => {
  assert.equal(normalizeAnswer('Paris'), 'paris')
  assert.equal(normalizeAnswer(' PARIS '), 'paris')
  assert.equal(normalizeAnswer('paris'), 'paris')
})

test('normalizeAnswer keeps inner whitespace and ё/е distinct (BR-64)', () => {
  assert.notEqual(normalizeAnswer('ёлка'), normalizeAnswer('елка'))
  assert.notEqual(normalizeAnswer('a  b'), normalizeAnswer('a b'))
  assert.equal(normalizeAnswer('мама мыла раму'), 'мама мыла раму')
})

test('normalizeAnswer returns empty string for blank input', () => {
  assert.equal(normalizeAnswer(''), '')
  assert.equal(normalizeAnswer('   '), '')
})
