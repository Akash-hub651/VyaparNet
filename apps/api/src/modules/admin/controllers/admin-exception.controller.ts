import {
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Req,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AdminContextGuard } from '../guards/admin-context.guard';
import { AdminIdempotencyGuard } from '../guards/admin-idempotency.guard';
import {
  AdminExceptionService,
  BusinessExceptionsDto,
} from '../services/admin-exception.service';
import { AuditSafeWriterService } from '../../security/audit/audit-safe-writer.service';
import { AuditAction } from '@vyaparnet/types';
import type { TechnicalExceptionDto } from '@vyaparnet/types';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';

/**
 * AdminExceptionsController — Exception Center & DLQ endpoints (Phase 10).
 *
 * INV-S7-1:  @UseGuards(JwtAuthGuard, AdminContextGuard) only.
 * INV-S7-24: DLQ queue name LOCKED as 'notifications-failed'.
 * FOOTGUN-10-B: Exception data is NEVER cached in Redis.
 * FOOTGUN-10-C: Queue name 'notifications-failed' — never aliased.
 * INV-S7-2:  DLQ retry → AuditLog via safeWrite() OUTSIDE any $tx.
 *
 * Authority: §25 Phase 10 Step 10.4.
 */
@UseGuards(JwtAuthGuard, AdminContextGuard) // INV-S7-1
@Controller('admin/exceptions')
export class AdminExceptionsController {
  private readonly logger = new Logger(AdminExceptionsController.name);

  constructor(
    private readonly exceptionService: AdminExceptionService,
    private readonly auditWriter: AuditSafeWriterService,
    @InjectQueue('notifications-failed') // FOOTGUN-10-C: name LOCKED (INV-S7-24)
    private readonly notificationsFailedQueue: Queue,
  ) {}

  // ─── GET /admin/exceptions ────────────────────────────────────────────────

  /**
   * Combined exception overview (business + technical).
   * FOOTGUN-10-B: NOT cached — fresh on every request (INV-S7-34).
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getExceptions(@Req() req: Request & { user: { id: string } }): Promise<{
    business: BusinessExceptionsDto;
    technical: TechnicalExceptionDto;
  }> {
    const [business, technical] = await Promise.all([
      this.exceptionService.getBusinessExceptions(),
      this.exceptionService.getTechnicalExceptions(),
    ]);

    this.logger.log(
      {
        adminId: req.user.id,
        stuckOrders: business.stuckOrders.length,
        failedPayments: business.failedPayments.length,
        dlqDepth: technical.dlqDepth,
      },
      'ADMIN_EXCEPTIONS_VIEWED',
    );

    return { business, technical };
  }

  // ─── GET /admin/exceptions/dlq ────────────────────────────────────────────

  /**
   * Reads first 10 failed jobs from 'notifications-failed' DLQ.
   * FOOTGUN-10-C: Queue name LOCKED as 'notifications-failed' (INV-S7-24).
   */
  @Get('dlq')
  @HttpCode(HttpStatus.OK)
  async getDlqJobs(): Promise<{
    total: number;
    jobs: Array<{
      id: string | number;
      name: string;
      failedReason: string | undefined;
      attemptsMade: number;
      timestamp: number;
    }>;
  }> {
    const jobs = await this.notificationsFailedQueue.getFailed(0, 10);

    return {
      total: jobs.length,
      jobs: jobs.map((j) => ({
        id: j.id,
        name: j.name,
        failedReason: j.failedReason,
        attemptsMade: j.attemptsMade,
        timestamp: j.timestamp,
      })),
    };
  }

  // ─── POST /admin/exceptions/dlq/:jobId/retry ──────────────────────────────

  /**
   * Retries a single failed DLQ job.
   * INV-S7-2:  AuditLog created via safeWrite() — NEVER from $tx.
   * INV-S7-3:  actorId = req.user.id (JWT only).
   * INV-S7-7:  Idempotency-Key enforced (AdminIdempotencyGuard).
   * FOOTGUN-10-C: 'notifications-failed' — never alias.
   */
  @Post('dlq/:jobId/retry')
  @UseGuards(AdminIdempotencyGuard) // INV-S7-7: state-changing endpoint
  @HttpCode(HttpStatus.OK)
  async retryDlqJob(
    @Param('jobId') jobId: string,
    @Req() req: Request & { user: { id: string } },
  ): Promise<{ jobId: string; status: 'RETRIED' }> {
    const adminId = req.user.id; // INV-S7-3: JWT only

    // Find the failed job in the queue
    const jobs = await this.notificationsFailedQueue.getFailed(0, 1000);
    const job = jobs.find((j) => String(j.id) === jobId);

    if (!job) {
      throw new NotFoundException({
        code: 'DLQ_JOB_NOT_FOUND',
        jobId,
      });
    }

    // Retry the job (moves from failed back to waiting)
    await job.retry();

    this.logger.log(
      {
        action: 'DLQ_JOB_RETRIED',
        adminId,
        jobId,
        jobName: job.name,
      },
      'ADMIN_DLQ_JOB_RETRY',
    );

    // INV-S7-2: AuditLog OUTSIDE $tx (safeWrite absorbs errors — INV-S7-5)
    await this.auditWriter.safeWrite({
      actorId: adminId, // INV-S7-3
      action: AuditAction.STATUS_CHANGE,
      entityType: 'DlqJob',
      entityId: jobId,
      entityName: job.name,
      oldValue: { status: 'FAILED', failedReason: job.failedReason },
      newValue: { status: 'RETRIED', attemptsMade: job.attemptsMade },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string,
    });

    return { jobId, status: 'RETRIED' };
  }
}
