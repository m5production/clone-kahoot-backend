import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { assertValidAnswerTexts } from '../src/modules/accepted-answers/accepted-answers.util'

const invalid = (existing: string[], added: string[], message: RegExp) =>
  assert.throws(
    () => assertValidAnswerTexts(existing, added),
    (error) => error instanceof BadRequestException && message.test((error as Error).message),
  )

test('accepts a batch of unique non-blank answers', () => {
  assert.doesNotThrow(() => assertValidAnswerTexts([], ['Paris', 'Lutetia']))
  assert.doesNotThrow(() => assertValidAnswerTexts(['Paris'], ['Lutetia']))
})

test('rejects an empty batch', () => {
  invalid([], [], /at least one/)
})

test('rejects a batch that pushes the total over 10 answers', () => {
  const eleven = Array.from({ length: 11 }, (_, i) => `a${i}`)
  invalid([], eleven, /at most 10/)
  invalid(['a0'], eleven.slice(0, 10), /at most 10/)
})

test('rejects blank answers', () => {
  invalid([], ['  '], /must not be empty/)
  invalid([], ['ok', '  '], /must not be empty/)
})

test('rejects duplicates inside the batch after normalization', () => {
  invalid([], ['Paris', 'paris'], /duplicate/)
  invalid([], ['Paris', ' PARIS '], /duplicate/)
})

test('rejects an answer duplicating a stored one after normalization', () => {
  invalid(['Paris'], [' paris '], /duplicate/)
})
