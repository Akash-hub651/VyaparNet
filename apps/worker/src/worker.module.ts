import { Module } from "@nestjs/common";
// Workers added Sprint 3+
// Currently: bare module to verify worker scaffold works

@Module({
  imports: [
    // ConfigModule (Sprint 1)
    // PrismaModule (Sprint 1)
    // RedisModule (Sprint 1)
    // BullMQModule (Sprint 3+)
  ],
})
export class WorkerModule {}
