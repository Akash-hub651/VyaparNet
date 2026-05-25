import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './shared/filters/global-exception.filter';
import { RequestIdInterceptor } from './shared/interceptors/request-id.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Disable default NestJS logger — we use Pino
    bufferLogs: true,
  });

  // ─── Use Pino logger globally ───
  app.useLogger(app.get(Logger));
  app.flushLogs();

  // ─── Security headers ───
  // Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 17
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // ─── CORS ───
  const corsOrigins = process.env['CORS_ORIGINS']?.split(',') ?? [
    'http://localhost:3000',
  ];
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'Idempotency-Key',
      'Accept-Language',
    ],
  });

  // ─── Global prefix ───
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/ready'],
  });

  // ─── Global exception filter ───
  // Authority: VyaparNet_PRDv2_Final_Freeze.docx Section 5
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ─── Global interceptors ───
  app.useGlobalInterceptors(new RequestIdInterceptor());

  // ─── Start server ───
  const port = parseInt(process.env['API_PORT'] ?? '3000', 10);
  const host = process.env['API_HOST'] ?? '0.0.0.0';
  await app.listen(port, host);

  const logger = app.get(Logger);
  logger.log(
    `🚀 VyaparNet API running on http://${host}:${port}`,
    'Bootstrap',
  );
  logger.log(
    `📡 Health: http://${host}:${port}/health`,
    'Bootstrap',
  );

  // ─── Graceful Shutdown ───
  // Authority: VyaparNet_Deployment_Runtime_Architecture_v1.md Section 5.3
  // Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 22.8
  const gracefulShutdown = async (signal: string): Promise<void> => {
    logger.log(`${signal} received. Starting graceful shutdown...`, 'Bootstrap');

    // Stop accepting new requests
    await app.close();

    // Note: PrismaService.onModuleDestroy() disconnects DB
    // Note: RedisService.onModuleDestroy() disconnects Redis
    // These are called automatically by app.close()

    logger.log('Graceful shutdown complete. Exiting.', 'Bootstrap');
    process.exit(0);
  };

  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

  // ─── Unhandled rejections ───
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection', reason as Error, 'Bootstrap');
  });

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', error, 'Bootstrap');
    process.exit(1);
  });
}
bootstrap();
