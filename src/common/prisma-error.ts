export const hasPrismaCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === code

export const isUniqueViolation = (error: unknown): boolean => hasPrismaCode(error, 'P2002')
