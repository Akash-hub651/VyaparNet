import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { getContext } from '../context/async-local-storage';

/**
 * Global Exception Filter
 *
 * Converts all exceptions into the VyaparNet standard error envelope:
 * {
 *   success: false,
 *   error: {
 *     code: string,         ← Machine-readable
 *     message: string,      ← Human-readable
 *     details?: object,     ← Optional additional context
 *   },
 *   requestId: string,
 * }
 *
 * Authority: VyaparNet_PRDv2_Final_Freeze.docx Section 5
 * Authority: VyaparNet_API_Contracts_Backend_Scaffold_Blueprint.md Section 1
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (getContext<string>('requestId')) ??
      (request.headers['x-request-id'] as string | undefined) ??
      'unknown';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        code = this.statusToCode(statusCode);
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const errObj = exceptionResponse as Record<string, unknown>;
        code = (errObj['code'] as string | undefined) ?? this.statusToCode(statusCode);
        message = (errObj['message'] as string | undefined) ?? message;
        details = (errObj['details'] as Record<string, unknown> | undefined);
      }
    } else if (exception instanceof Error) {
      // Unexpected errors — do not expose stack trace to client
      this.logger.error(
        { requestId, error: exception.message, stack: exception.stack },
        'Unhandled exception',
      );
    } else {
      this.logger.error({ requestId, exception }, 'Unknown exception type');
    }

    // Log all errors (INFO for client errors, ERROR for server errors)
    if (statusCode >= 500) {
      this.logger.error(
        { requestId, statusCode, code, path: request.url },
        message,
      );
    } else if (statusCode >= 400) {
      this.logger.warn(
        { requestId, statusCode, code, path: request.url },
        message,
      );
    }

    response.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
      requestId,
    });
  }

  private statusToCode(status: number): string {
    const statusCodeMap: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE',
      429: 'RATE_LIMITED',
      500: 'INTERNAL_ERROR',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT',
    };
    return statusCodeMap[status] ?? 'UNKNOWN_ERROR';
  }
}
