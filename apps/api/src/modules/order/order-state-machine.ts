import { UnprocessableEntityException } from '@nestjs/common';
import { OrderStatus } from '@vyaparnet/database';

// Locked transition map — implemented in OrderStateMachine per §6.2
const VALID_TRANSITIONS: Record<string, OrderStatus[]> = {
  PLACED: ['CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'], // Sprint 5 active. CONFIRMED→SHIPPED is SELLER-ONLY (via SELLER_VALID_TRANSITIONS)
  PAYMENT_FAILED: ['CONFIRMED', 'CANCELLED'],
  PROCESSING: ['SHIPPED'], // Sprint 5
  SHIPPED: ['DELIVERED'], // Sprint 5
  DELIVERED: ['COMPLETED'], // Sprint 5
  COMPLETED: [], // Terminal
  CANCELLED: [], // Terminal
  RETURN_INITIATED: [],
  REFUND_INITIATED: [],
  DISPUTE_OPEN: ['DISPUTE_RESOLVED'],
  DISPUTE_RESOLVED: [],
};

const TERMINAL_STATES: OrderStatus[] = ['COMPLETED', 'CANCELLED'];

// Sprint 5 states — present in state machine but return 422 in Sprint 4
// In Sprint 5, PROCESSING and SHIPPED are unlocked. DELIVERED and COMPLETED remain locked until Sprint 7.
const SPRINT5_STATES: OrderStatus[] = ['DELIVERED', 'COMPLETED'];

export const STATUS_TIMESTAMP_FIELD_MAP: Partial<Record<OrderStatus, string>> =
  {
    CONFIRMED: 'confirmedAt',
    PROCESSING: 'processingAt',
    SHIPPED: 'shippedAt',
  } as const;

export function validateTransition(
  current: OrderStatus,
  next: OrderStatus,
): void {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw new UnprocessableEntityException({
      code: 'INVALID_STATUS_TRANSITION',
      message: `Cannot transition from ${current} to ${next}`,
      currentStatus: current,
      requestedStatus: next,
    });
  }
  // Sprint 4 forward-compatibility guard — §6.1
  if (SPRINT5_STATES.includes(next)) {
    throw new UnprocessableEntityException({
      code: 'TRANSITION_NOT_YET_ACTIVE',
      message: `Transition to ${next} will be activated in Sprint 5`,
    });
  }
}

// Sprint 5: Seller-specific transition map (INV-S5-6, INV-S5-7)
// DELIVERED/COMPLETED transitions are RESERVED for Sprint 7 admin flow.
const SELLER_VALID_TRANSITIONS: Partial<Record<string, OrderStatus[]>> = {
  PLACED: ['CONFIRMED'],
  CONFIRMED: ['PROCESSING', 'SHIPPED'],
  PROCESSING: ['SHIPPED'],
  // All other statuses: seller cannot initiate transitions
};

export function validateSellerTransition(
  current: OrderStatus,
  next: OrderStatus,
): void {
  // DELIVERED / COMPLETED guard — Sprint 7 only (INV-S5-7)
  if (next === 'DELIVERED' || next === 'COMPLETED') {
    throw new UnprocessableEntityException({
      code: 'TRANSITION_RESERVED_FOR_ADMIN',
      message: `Transition to ${next} is reserved for Sprint 7 Admin`,
    });
  }

  const allowed = SELLER_VALID_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new UnprocessableEntityException({
      code: 'INVALID_STATUS_TRANSITION',
      from: current,
      to: next,
      allowedTransitions: allowed,
    });
  }
}

// =============================================================================
// Sprint 7: Admin Order State Machine (INV-S7-13)
// DO NOT modify SELLER_VALID_TRANSITIONS or validateSellerTransition() above.
// This is a separate, additive function for admin-only transitions.
// H-P2-4 HARDENED: Duplicate SHIPPED/DELIVERED entries removed.
//                  Single authoritative definition below:
// =============================================================================

// Admin transition map: non-terminal → CANCELLED (force), SHIPPED → DELIVERED, DELIVERED → COMPLETED
const ADMIN_ALLOWED_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  // Forward transitions (admin gate unlocked in Sprint 7):
  SHIPPED: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  DELIVERED: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  // Force-cancel from early non-terminal states:
  PLACED: [OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.CANCELLED],
  PROCESSING: [OrderStatus.CANCELLED],
  PAYMENT_FAILED: [OrderStatus.CANCELLED],
};

const ADMIN_TERMINAL_STATES: OrderStatus[] = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
];

/**
 * validateAdminTransition — Sprint 7 admin-only order state machine.
 *
 * Rules:
 *  - COMPLETED and CANCELLED are terminal — no further transitions (ORDER_TERMINAL_STATE)
 *  - Cancelling requires a reason (CANCELLATION_REASON_REQUIRED)
 *  - Only transitions in ADMIN_ALLOWED_TRANSITIONS are valid (INVALID_ADMIN_TRANSITION)
 *
 * INV-S7-13: MUST NOT modify validateSellerTransition() or SELLER_VALID_TRANSITIONS.
 * FOOTGUN-6-A: Use this function — NEVER validateSellerTransition() — for admin status changes.
 */
export function validateAdminTransition(
  current: OrderStatus,
  next: OrderStatus,
  reason?: string,
): void {
  if (ADMIN_TERMINAL_STATES.includes(current)) {
    throw new UnprocessableEntityException({
      code: 'ORDER_TERMINAL_STATE',
      message: `Order is in terminal state ${current}. Admin cannot transition.`,
    });
  }
  if (next === OrderStatus.CANCELLED && !reason) {
    throw new UnprocessableEntityException({
      code: 'CANCELLATION_REASON_REQUIRED',
      message: 'Reason is required for admin force-cancel.',
    });
  }
  const allowed = ADMIN_ALLOWED_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    throw new UnprocessableEntityException({
      code: 'INVALID_ADMIN_TRANSITION',
      message: `Admin cannot transition from ${current} to ${next}.`,
    });
  }
}

export function assertNotTerminal(order: {
  id: string;
  status: OrderStatus | string;
}): void {
  if (TERMINAL_STATES.includes(order.status as OrderStatus)) {
    throw new UnprocessableEntityException({
      code: 'ORDER_ALREADY_TERMINAL',
      message: `Order ${order.id} is in terminal state ${order.status}. No further transitions.`,
    });
  }
}

export function formatYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function isPrismaUniqueConstraintError(
  err: unknown,
  field: string,
): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as any).code === 'P2002' &&
    'meta' in err &&
    (err as any).meta?.target?.includes(field)
  );
}

export function generateOrderNumber(): string {
  const date = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const randomPart = String(Math.floor(10000 + Math.random() * 90000));
  return `VN-${datePart}-${randomPart}`;
}
