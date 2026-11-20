import { BadRequestException } from '@nestjs/common'
import { normalizeAnswer } from '../../common/normalize-answer'

export const MAX_ACCEPTED_ANSWERS = 10

/**
 * BR-47: a question has 1-10 accepted answers, each non-blank after trim, and
 * no two may coincide after normalization (BR-64). `existingTexts` are the
 * answers already stored for the question (empty when the whole set is being
 * replaced); `addedTexts` is the incoming batch.
 */
export const assertValidAnswerTexts = (existingTexts: string[], addedTexts: string[]): void => {
  if (addedTexts.length === 0) {
    throw new BadRequestException('A question needs at least one accepted answer')
  }
  if (existingTexts.length + addedTexts.length > MAX_ACCEPTED_ANSWERS) {
    throw new BadRequestException(
      `A question can have at most ${MAX_ACCEPTED_ANSWERS} accepted answers`,
    )
  }
  const seen = new Set(existingTexts.map(normalizeAnswer))
  for (const text of addedTexts) {
    const normalized = normalizeAnswer(text)
    if (!normalized) {
      throw new BadRequestException('Accepted answer text must not be empty')
    }
    if (seen.has(normalized)) {
      throw new BadRequestException('Accepted answers must not duplicate each other')
    }
    seen.add(normalized)
  }
}
