import type { HandlerContext } from '../channels/channel.interface';
import type { UserSuspendedPayload } from '@vyaparnet/types';

/**
 * handleUserSuspended — handles 'UserSuspended' EventOutbox event.
 *
 * Sends AccountSuspended_SELLER_hi notification to the suspended user.
 *
 * GOVERNANCE:
 * - Called by OutboxConsumerWorker AFTER $transaction commits (INV-S7-19).
 * - AdminUserService also calls sendDirect() immediately (fast path).
 *   This handler is the guaranteed delivery async path.
 * - Deduplication prevents double-delivery within 300s.
 *
 * Template: AccountSuspended_SELLER_hi
 * Variables: {} (no template variables needed for suspension notice)
 */
export async function handleUserSuspended(
  payload: UserSuspendedPayload,
  ctx: HandlerContext,
): Promise<void> {
  const { userId } = payload;

  const dedupKey = `notif:${userId}:UserSuspended`;
  if (await ctx.deduplicationService.isDuplicate(dedupKey)) {
    ctx.logger.log({ userId }, 'NOTIFICATION_DEDUP_SKIPPED_USER_SUSPENDED');
    return;
  }

  const contact = await ctx.userContactService.getContact(userId);

  await ctx.notificationService.createAndEnqueue({
    userId,
    contact,
    templateName: 'AccountSuspended_SELLER_hi',
    variables: {},
    entityId: userId,
    eventType: 'UserSuspended',
    channels: ['sms', 'email', 'inApp'],
  });

  await ctx.deduplicationService.setProcessed(dedupKey, 300);
}
