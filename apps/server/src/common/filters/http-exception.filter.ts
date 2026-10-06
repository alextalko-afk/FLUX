import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as any;

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: exceptionResponse.message || exception.message,
      error: exceptionResponse.error || HttpStatus[status],
      // Machine-readable code (`INVALID_CURRENT_PASSWORD`, `SESSION_REVOKED`, ...)
      // so clients can branch on it instead of parsing the message text.
      ...(typeof exceptionResponse.code === 'string' ? { code: exceptionResponse.code } : {}),
      ...(exceptionResponse.retryAfterSeconds
        ? { retryAfterSeconds: exceptionResponse.retryAfterSeconds }
        : {}),
    };

    if (status >= 500) {
      this.logger.error(`Server Error: ${request.method} ${request.url} - ${exception.message}`, exception.stack);
    }

    response.status(status).json(errorResponse);
  }
}
