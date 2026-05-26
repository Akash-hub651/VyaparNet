import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request, Response } from 'express';
import { asyncLocalStorage } from '../context/async-local-storage';

/**
 * RequestId Interceptor
 *
 * For every incoming request:
 * 1. Reads or generates X-Request-Id
 * 2. Sets it in the response headers
 * 3. Stores it in AsyncLocalStorage for downstream access
 *
 * This enables trace correlation across all log entries for a request.
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 22.6
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const requestId =
      (request.headers['x-request-id'] as string) ??
      `req_${Math.random().toString(36).substring(2, 11)}`;

    response.setHeader('X-Request-Id', requestId);

    const store = new Map<string, unknown>();
    store.set('requestId', requestId);
    store.set('traceId', requestId);

    return new Observable((subscriber) => {
      asyncLocalStorage.run(store, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (err: unknown) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
