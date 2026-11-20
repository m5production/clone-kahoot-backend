import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { assertQuestionIdPermutation } from '../src/modules/games/reorder-questions.util'

const current = ['q1', 'q2', 'q3']

test('accepts a permutation of the current ids', () => {
  assert.doesNotThrow(() => assertQuestionIdPermutation(current, ['q3', 'q1', 'q2']))
  assert.doesNotThrow(() => assertQuestionIdPermutation(current, current))
  assert.doesNotThrow(() => assertQuestionIdPermutation([], []))
})

test('rejects a shorter or longer list', () => {
  for (const next of [['q1', 'q2'], ['q1', 'q2', 'q3', 'q4'], []]) {
    assert.throws(() => assertQuestionIdPermutation(current, next), {
      name: BadRequestException.name,
      message: /permutation/,
    })
  }
})

test('rejects duplicates and foreign ids', () => {
  for (const next of [
    ['q1', 'q1', 'q2'],
    ['q1', 'q2', 'foreign'],
    ['q2', 'q3', 'q3'],
  ]) {
    assert.throws(() => assertQuestionIdPermutation(current, next), {
      name: BadRequestException.name,
      message: /permutation/,
    })
  }
})
