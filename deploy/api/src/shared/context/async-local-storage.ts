import { AsyncLocalStorage } from 'async_hooks';

/**
 * Request-scoped context storage.
 *
 * Allows any service or repository to access request-level context
 * (traceId, userId) without passing it through function parameters.
 *
 * Usage:
 *   const ctx = asyncLocalStorage.getStore();
 *   const traceId = ctx?.get('traceId');
 *
 * Initialized in RequestIdInterceptor (see shared/interceptors/).
 *
 * Authority: VyaparNet_Implementation_Architecture_Official_Freeze_v1.md Section 22.6
 */
export const asyncLocalStorage = new AsyncLocalStorage<Map<string, unknown>>();

/**
 * Get a value from the current request context.
 * Returns undefined if called outside of a request scope.
 */
export function getContext<T = unknown>(key: string): T | undefined {
  return asyncLocalStorage.getStore()?.get(key) as T | undefined;
}

/**
 * Set a value in the current request context.
 * No-op if called outside of a request scope.
 */
export function setContext(key: string, value: unknown): void {
  asyncLocalStorage.getStore()?.set(key, value);
}
