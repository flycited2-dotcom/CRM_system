import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ResolvedError = {
  status: number;
  message: string | string[];
};

// Prisma request errors that are the caller's fault, not a server failure.
const PRISMA_ERRORS: Record<string, ResolvedError> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'Record with these values already exists' },
  P2003: { status: HttpStatus.BAD_REQUEST, message: 'Referenced record does not exist' },
  P2023: { status: HttpStatus.BAD_REQUEST, message: 'Invalid identifier' },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Record not found' }
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const { status, message } = this.resolve(exception, request);

    const code =
      status === HttpStatus.BAD_REQUEST
        ? 'VALIDATION_ERROR'
        : status === HttpStatus.UNAUTHORIZED
          ? 'UNAUTHORIZED'
          : status === HttpStatus.FORBIDDEN
            ? 'FORBIDDEN'
            : status === HttpStatus.NOT_FOUND
              ? 'NOT_FOUND'
              : status === HttpStatus.CONFLICT
                ? 'CONFLICT'
                : status === HttpStatus.TOO_MANY_REQUESTS
                  ? 'TOO_MANY_REQUESTS'
                  : status >= HttpStatus.INTERNAL_SERVER_ERROR
                    ? 'INTERNAL_ERROR'
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

  private resolve(exception: unknown, request: Request): ResolvedError {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as { message: string | string[] }).message
          : exception.message;

      return { status: exception.getStatus(), message };
    }

    const prismaCode = (exception as { code?: unknown } | null)?.code;
    const prismaError = typeof prismaCode === 'string' ? PRISMA_ERRORS[prismaCode] : undefined;

    if (prismaError) {
      return prismaError;
    }

    // Anything else is a server fault: keep the details in the log, never in the response.
    this.logger.error(
      `${request.method} ${request.originalUrl ?? request.url} failed`,
      exception instanceof Error ? exception.stack : String(exception)
    );

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }
}
