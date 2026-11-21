import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { Request } from 'express'
import type { PublicUser } from './auth.service'

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PublicUser => {
    return ctx.switchToHttp().getRequest<Request>().user as PublicUser
  },
)

export const SessionToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    return ctx.switchToHttp().getRequest<Request>().sessionToken as string
  },
)
