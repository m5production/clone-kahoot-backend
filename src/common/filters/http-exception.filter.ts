import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Request, Response } from 'express'

const statusToCode: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  429: 'TOO_MANY_REQUESTS',
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
    const requestId = request.requestId ?? 'unknown'

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'Internal server error'
    let details: Record<string, unknown> = {}

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const body = exception.getResponse()
      message =
        typeof body === 'string'
          ? body
          : Array.isArray((body as { message?: unknown }).message)
            ? (body as { message: string[] }).message.join('; ')
            : ((body as { message?: string }).message ?? exception.message)
      if (typeof body === 'object' && body !== null) {
        // extra fields (e.g. sessionId on a 409) pass through; framework keys do not
        const { message: _m, statusCode: _s, error: _e, ...rest } = body as Record<string, unknown>
        details = rest
      }
    } else {
      this.logger.error(`Unhandled error (request ${requestId})`, exception)
    }

    response.status(status).json({
      code: statusToCode[status] ?? 'INTERNAL_ERROR',
      message,
      requestId,
      ...details,
    })
  }
}
