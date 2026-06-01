/**
 * maskBuyerId
 * Returns BUYER-{last6ofId} as per Sprint 5 security invariant (INV-S5-4).
 * Replaces the old function that used the first 6 characters because of UUID distribution.
 */
export function maskBuyerId(buyerId: string): string {
  // Use last 6 characters for better entropy since UUIDv4 first chars have less entropy in string form, 
  // actually UUIDv4 is random everywhere except the version byte, but the spec says slice(-6) in Phase 14 snippet.
  return `BUYER-${buyerId.slice(-6).toUpperCase()}`;
}
