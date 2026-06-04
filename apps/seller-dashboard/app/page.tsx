'use client';

/**
 * Root Page — apps/seller-dashboard/app/page.tsx
 *
 * Authority: seller_dashboard_architecture.md §9 (Route Architecture)
 * "Root `/` shows Sprint 0 stub → page.tsx becomes redirect to /dashboard or /login"
 *
 * Behavior:
 * - isLoading → show FullPageLoader (never flash)
 * - isAuthenticated → redirect to /dashboard
 * - !isAuthenticated → redirect to /login
 *
 * This page is reached only for direct `/` visits.
 * The `(main)/layout.tsx` auth guard handles protection of all /dashboard and other routes.
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './contexts/auth.context';
import { FullPageLoader } from '../components/ui/Skeleton';

export default function RootPage(): React.JSX.Element {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Always show loader while determining auth state
  return <FullPageLoader />;
}
