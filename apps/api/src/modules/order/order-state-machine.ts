import { UnprocessableEntityException } from '@nestjs/common';
import { OrderStatus } from '@vyaparnet/database';

// Locked transition map — implemented in OrderStateMachine per §6.2
const VALID_TRANSITIONS: Record<string, OrderStatus[]> = {
  PLACED: ['CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],   // PROCESSING is Sprint 5 — 422 until then
  PAYMENT_FAILED: ['CONFIRMED', 'CANCELLED'],
  PROCESSING: ['SHIPPED'],                  // Sprint 5
  SHIPPED: ['DELIVERED'],                   // Sprint 5
  DELIVERED: ['COMPLETED'],                 // Sprint 5
  COMPLETED: [],                            // Terminal
  CANCELLED: [],                            // Terminal
  RETURN_INITIATED: [],
  REFUND_INITIATED: [],
  DISPUTE_OPEN: ['DISPUTE_RESOLVED'],
  DISPUTE_RESOLVED: [],
};

const TERMINAL_STATES: OrderStatus[] = ['COMPLETED', 'CANCELLED'];

// Sprint 5 states — present in state machine but return 422 in Sprint 4
const SPRINT5_STATES: OrderStatus[] = ['PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED'];

export function validateTransition(current: OrderStatus, next: OrderStatus): void {
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

export function assertNotTerminal(order: { id: string; status: OrderStatus | string }): void {
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

export function isPrismaUniqueConstraintError(err: unknown, field: string): boolean {
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
