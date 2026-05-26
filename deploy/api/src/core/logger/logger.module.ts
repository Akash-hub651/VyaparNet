import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

/**
 * Logger Module — configures Pino structured logging.
 *
 * Log format:
 * - Development: pino-pretty (human-readable)
 * - Production: JSON (machine-readable, for Loki/CloudWatch)
 *
 * Every log entry includes:
 * - timestamp (ISO 8601, UTC)
 * - level
 * - message
 * - trace_id (from X-Request-Id header)
 * - context (NestJS component name)
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 12
 */
@Module({
  imports: [
    PinoLoggerModule.forRoot({
      pinoHttp: {
        level: process.env['NODE_ENV'] === 'production' ? 'warn' : 'info',
        transport:
          process.env['NODE_ENV'] !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: false,
                  translateTime: "yyyy-mm-dd'T'HH:MM:ss.l'Z'",
                  ignore: 'pid,hostname',
                },
              }
            : undefined,
        customProps: (_req, _res) => ({
          context: 'HTTP',
        }),
        serializers: {
          req: (req: { id: string; method: string; url: string }) => ({
            id: req.id,
            method: req.method,
            url: req.url,
            // DO NOT log: headers (contains Authorization), body (may contain PII)
          }),
          res: (res: { statusCode: number }) => ({
            statusCode: res.statusCode,
          }),
        },
        // Redact sensitive fields — never log these
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.otp',
            'req.body.token',
            '*.password',
            '*.otp',
            '*.token',
            '*.secret',
          ],
          censor: '[REDACTED]',
        },
        genReqId: (req: any) => {
          return (
            req.headers['x-request-id'] ??
            `req_${Math.random().toString(36).substring(2, 11)}`
          );
        },
      },
    }),
  ],
})
export class LoggerModule {}
