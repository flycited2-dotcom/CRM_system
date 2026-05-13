import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const message =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
        ? (exceptionResponse as { message: string | string[] }).message
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    const code =
      status === HttpStatus.BAD_REQUEST
        ? 'VALIDATION_ERROR'
        : status === HttpStatus.UNAUTHORIZED
          ? 'UNAUTHORIZED'
          : status === HttpStatus.FORBIDDEN
            ? 'FORBIDDEN'
            : 'REQUEST_ERROR';

    response.status(status).json({
      success: false,
      error: {
        code,
        message: Array.isArray(message) ? message.join(', ') : message,
        details: Array.isArray(message) ? message : []
      }
    });
  }
}
