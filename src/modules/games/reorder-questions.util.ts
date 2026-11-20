import { BadRequestException } from '@nestjs/common'

/**
 * FR-54: a reorder payload is valid only when it is a permutation of the
 * question ids the game currently has — same length, no duplicates, no
 * foreign or missing ids.
 */
export const assertQuestionIdPermutation = (currentIds: string[], nextIds: string[]): void => {
  const current = new Set(currentIds)
  if (nextIds.length !== current.size || new Set(nextIds).size !== nextIds.length) {
    throw new BadRequestException('questionIds must be a permutation of the current question ids')
  }
  for (const id of nextIds) {
    if (!current.has(id)) {
      throw new BadRequestException('questionIds must be a permutation of the current question ids')
    }
  }
}
