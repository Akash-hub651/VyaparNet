/**
 * Admin Auth Session Utilities — Phase 15
 *
 * Server utility functions for session management — used in Server Components.
 * JWT is stored in httpOnly cookie by the API (FOOTGUN-15-B: no localStorage).
 */

import { cookies } from 'next/headers';
import { getAdminMe, type AdminUser } from './api';

/**
 * getAdminSession — reads the admin JWT cookie and fetches the current user.
 * Returns null if unauthenticated.
 */
export async function getAdminSession(): Promise<AdminUser | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token');
    if (!token) return null;
    return await getAdminMe();
  } catch {
    return null;
  }
}

/**
 * requireAdminSession — throws redirect to /login if unauthenticated.
 * Used at the top of every protected server component.
 */
export async function requireAdminSession(): Promise<AdminUser> {
  const session = await getAdminSession();
  if (!session) {
    const { redirect } = await import('next/navigation');
    redirect('/login');
  }
  // redirect() above always throws — session is non-null here
  return session!;
}
