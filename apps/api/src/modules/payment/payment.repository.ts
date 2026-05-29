import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Prisma, Payment, PaymentMethod, PaymentStatus } from '@vyaparnet/database';

export interface CreatePaymentData {
  orderId: string;
  amount: Prisma.Decimal | number;
  method: PaymentMethod;
  gateway: string;
  gatewayRef?: string;
  idempotencyKey?: string;
  status?: PaymentStatus;
}

/**
 * PaymentRepository — data access for Payment records.
 *
 * Authority: SPRINT_4_EXECUTION_LOCK_FINAL.md §11.2
 *
 * GOVERNANCE:
 *  - PaymentModule OWNS the Payment table. No other module writes to it directly.
 *  - All queries include ownership via orderId (caller must verify orderId ownership separately).
 *  - No update() without explicit column list — prevents accidental field overwrite.
 */
@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreatePaymentData): Promise<Payment> {
    return this.prisma.payment.create({
      data: {
        orderId: data.orderId,
        amount: new Prisma.Decimal(data.amount),
        method: data.method,
        gateway: data.gateway,
        gatewayRef: data.gatewayRef,
        idempotencyKey: data.idempotencyKey,
        status: data.status ?? 'PENDING',
      },
    });
  }

  async findByOrderId(orderId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: { orderId, status: { not: 'FAILED' } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Used by webhook processor to find the active pending payment for an order. */
  async findPendingByOrderId(orderId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: { orderId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Used by retryPayment() to count prior failed attempts. */
  async findFailedByOrderId(orderId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: { orderId, status: 'FAILED' },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Used by PaymentReconciliationWorker: find PENDING payments older than N minutes. */
  async findPendingOlderThan(cutoff: Date): Promise<Payment[]> {
    return this.prisma.payment.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateCaptured(
    paymentId: string,
    gatewayPaymentId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Payment> {
    // HARDENED (INV-30): gatewayPaymentId has partial unique index — enforces exactly-once capture at DB level
    return tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'CAPTURED',
        capturedAt: new Date(),
        gatewayPaymentId, // HARDENED (INV-30): unique constraint prevents double-capture
      },
    });
  }

  async updateFailed(
    paymentId: string,
    failureReason: string,
    tx: Prisma.TransactionClient,
  ): Promise<Payment> {
    return tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        failureReason,
      },
    });
  }
}
