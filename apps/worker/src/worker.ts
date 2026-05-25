import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker.module";
import { Logger } from "nestjs-pino";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  app.flushLogs();

  const logger = app.get(Logger);
  logger.log(
    "VyaparNet Worker started. No workers registered in Sprint 0.",
    "Bootstrap",
  );

  // Workers are registered in Sprint 3+ domain modules
  // This bootstrap keeps the worker process alive
}

void bootstrap();
