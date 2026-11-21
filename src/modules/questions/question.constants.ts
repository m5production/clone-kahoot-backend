// BR-48: seconds to answer, from a fixed set (default 20)
export const TIME_LIMITS_SEC = [10, 20, 30, 60, 90, 120]

// D-10: 'open' — free-text answer, 'choice' — pick one of 2-4 options
export const QUESTION_TYPES = ['open', 'choice'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]
