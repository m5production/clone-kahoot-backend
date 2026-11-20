/**
 * BR-64 normalization for comparing user input with accepted answers:
 * trims surrounding whitespace and ignores case. Used both for validating
 * accepted answers (duplicates are rejected) and during the live game.
 */
export const normalizeAnswer = (text: string): string => text.trim().toLowerCase()
