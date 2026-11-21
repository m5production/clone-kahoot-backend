import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { AuthService, type PublicUser } from './auth.service'

declare module 'express' {
  interface Request {
    user?: PublicUser
    sessionToken?: string
  }
}

export const extractBearerToken = (req: Request): string | undefined => {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return undefined
  return header.slice('Bearer '.length).trim() || undefined
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>()
    const token = extractBearerToken(req)
    const user = await this.auth.authenticate(token)
    if (!user) throw new UnauthorizedException('Authentication required')
    req.user = user
    req.sessionToken = token
    return true
  }
}
