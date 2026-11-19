import { randomUUID } from 'node:crypto'
import { Injectable, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

declare module 'express' {
  interface Request {
    requestId?: string
  }
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    req.requestId = req.requestId ?? randomUUID()
    res.setHeader('x-request-id', req.requestId)
    next()
  }
}
