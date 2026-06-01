import { redirect } from 'next/navigation';
import { getAdminSession } from '../lib/auth';

/**
 * Root page — redirects to /businesses (KYC queue) if authenticated,
 * else redirects to /login.
 */
export default async function RootPage(): Promise<never> {
  const session = await getAdminSession();
  if (!session) {
    redirect('/login');
  }
  redirect('/businesses');
}
