import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BadRequestException } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { OptionItemDto } from '../src/modules/options/dto/option-item.dto'
import { assertValidOptions, type OptionInput } from '../src/modules/options/options.util'
import { UpdateQuestionDto } from '../src/modules/questions/dto/update-question.dto'

const options = (list: [string, boolean][]): OptionInput[] =>
  list.map(([text, isCorrect]) => ({ text, isCorrect }))

const invalid = (list: OptionInput[], message: RegExp) =>
  assert.throws(
    () => assertValidOptions(list),
    (error) => error instanceof BadRequestException && message.test((error as Error).message),
  )

test('accepts 2-4 options with exactly one correct', () => {
  assert.doesNotThrow(() =>
    assertValidOptions(
      options([
        ['a', true],
        ['b', false],
      ]),
    ),
  )
  assert.doesNotThrow(() =>
    assertValidOptions(
      options([
        ['a', false],
        ['b', true],
        ['c', false],
        ['d', false],
      ]),
    ),
  )
})

test('rejects fewer than 2 or more than 4 options', () => {
  invalid([], /2-4/)
  invalid(options([['a', true]]), /2-4/)
  invalid(
    options([
      ['a', true],
      ['b', false],
      ['c', false],
      ['d', false],
      ['e', false],
    ]),
    /2-4/,
  )
})

test('rejects zero or several correct options', () => {
  invalid(
    options([
      ['a', false],
      ['b', false],
    ]),
    /exactly one/,
  )
  invalid(
    options([
      ['a', true],
      ['b', true],
    ]),
    /exactly one/,
  )
})

test('rejects blank and duplicate options after normalization (BR-86, BR-64)', () => {
  invalid(
    options([
      ['a', true],
      ['  ', false],
    ]),
    /must not be empty/,
  )
  invalid(
    options([
      ['Paris', true],
      [' paris ', false],
    ]),
    /duplicate/,
  )
})

const validateDto = <T extends object>(cls: new () => T, body: unknown) =>
  validateSync(plainToInstance(cls, body), { whitelist: true, forbidNonWhitelisted: true })

test('UpdateQuestionDto accepts only the known question types (D-10)', () => {
  assert.equal(validateDto(UpdateQuestionDto, { text: 'q', type: 'open' }).length, 0)
  assert.equal(validateDto(UpdateQuestionDto, { text: 'q', type: 'choice' }).length, 0)
  assert.ok(validateDto(UpdateQuestionDto, { text: 'q', type: 'yesno' }).length > 0)
  assert.ok(validateDto(UpdateQuestionDto, { text: 'q', type: 42 }).length > 0)
})

test('OptionItemDto requires a boolean correctness mark', () => {
  assert.equal(validateDto(OptionItemDto, { text: 'a', isCorrect: true }).length, 0)
  assert.ok(validateDto(OptionItemDto, { text: 'a' }).length > 0)
  assert.ok(validateDto(OptionItemDto, { text: 'a', isCorrect: 'yes' }).length > 0)
})
