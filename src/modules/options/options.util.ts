import { BadRequestException } from '@nestjs/common'
import { normalizeAnswer } from '../../common/normalize-answer'

export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 4

export interface OptionInput {
  text: string
  isCorrect: boolean
}

/**
 * BR-86: a choice question has 2-4 options, each non-blank after trim, no two
 * may coincide after normalization (BR-64), and exactly one is marked correct.
 */
export const assertValidOptions = (options: OptionInput[]): void => {
  if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
    throw new BadRequestException(
      `A choice question needs ${MIN_OPTIONS}-${MAX_OPTIONS} answer options`,
    )
  }
  if (options.filter((option) => option.isCorrect).length !== 1) {
    throw new BadRequestException('A choice question needs exactly one correct option')
  }
  const seen = new Set<string>()
  for (const { text } of options) {
    const normalized = normalizeAnswer(text)
    if (!normalized) {
      throw new BadRequestException('Option text must not be empty')
    }
    if (seen.has(normalized)) {
      throw new BadRequestException('Answer options must not duplicate each other')
    }
    seen.add(normalized)
  }
}
