import { Injectable, Logger, type NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

/** Structured one-line-per-request log: method, path, status, ms, requestId — no headers or bodies */
@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP')

  use(req: Request, res: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint()
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
      this.logger.log(
        JSON.stringify({
          requestId: req.requestId,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          durationMs: Math.round(durationMs * 10) / 10,
        }),
      )
    })
    next()
  }
}
