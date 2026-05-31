import type { SupplierScoreUpdatedPayload } from '@vyaparnet/types';
import type { HandlerContext } from '../channels/channel.interface';

/**
 * handleSupplierScoreUpdated — handles 'SupplierScoreUpdated' EventOutbox event.
 *
 * INV-S6-10: ONLY sends notification when |scoreDelta| >= 5.
 *   Small fluctuations (< 5 points) are ignored — too noisy for sellers.
 *   First score (previousCompositeScore === null) → no notification.
 *
 * Channel selection based on direction:
 *   - Score improved: IN_APP only (positive news — lower urgency)
 *   - Score dropped:  SMS + IN_APP (negative news — seller needs to act)
 */
export async function handleSupplierScoreUpdated(
  payload: SupplierScoreUpdatedPayload,
  ctx: HandlerContext,
): Promise<void> {
  const { businessId, compositeScore, previousCompositeScore } = payload;

  // INV-S6-10: First score event has no previous — no notification
  if (previousCompositeScore === null || previousCompositeScore === undefined) {
    ctx.logger.debug({ businessId }, 'SCORE_FIRST_EVENT_NO_NOTIFICATION');
    return;
  }

  // INV-S6-10: Only notify when score changes >= 5 points
  const scoreDelta = Math.abs(compositeScore - previousCompositeScore);
  if (scoreDelta < 5) {
    ctx.logger.debug({ businessId, scoreDelta }, 'SCORE_CHANGE_BELOW_THRESHOLD');
    return;
  }

  // Resolve seller user ID via Business owner
  const sellerUserId = await ctx.userContactService.getBusinessOwnerUserId(businessId);
  if (!sellerUserId) {
    ctx.logger.warn({ businessId }, 'SCORE_SELLER_USER_NOT_FOUND');
    return;
  }

  const dedupKey = `notif:${sellerUserId}:SupplierScoreUpdated:${businessId}`;
  if (await ctx.deduplicationService.isDuplicate(dedupKey)) {
    ctx.logger.log({ sellerUserId, businessId }, 'NOTIFICATION_DEDUP_SKIPPED');
    ctx.metrics.notificationDedupSkippedTotal.inc({ eventType: 'SupplierScoreUpdated' });
    return;
  }

  const isImprovement = compositeScore > previousCompositeScore;
  const templateName = isImprovement ? 'ScoreImproved_SELLER_hi' : 'ScoreDropped_SELLER_hi';
  // INV-S6-10: Score drop → SMS (urgent); Score improvement → In-App only
  const channels = isImprovement ? ['inApp'] : ['sms', 'inApp'];

  const sellerContact = await ctx.userContactService.getContact(sellerUserId);

  await ctx.notificationService.createAndEnqueue({
    userId: sellerUserId,
    contact: sellerContact,
    templateName,
    variables: {
      compositeScore: compositeScore.toString(),
      previousCompositeScore: previousCompositeScore.toString(),
      scoreDelta: scoreDelta.toString(),
    },
    entityId: businessId,
    eventType: 'SupplierScoreUpdated',
    channels,
  });

  // Set dedup key AFTER successful enqueue (INV-S6-6)
  await ctx.deduplicationService.setProcessed(dedupKey, 300);
}
