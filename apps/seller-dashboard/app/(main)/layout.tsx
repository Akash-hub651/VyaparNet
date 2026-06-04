'use client';

/**
 * Seller Dashboard Main Layout — apps/seller-dashboard/app/(main)/layout.tsx
 *
 * Authority:
 *   seller_dashboard_architecture.md §10 (Permission Architecture — Auth Guard)
 *   seller_dashboard_screen_system.md §G.1 (Application Shell)
 *
 * Rules:
 * - isLoading → show FullPageLoader (never flash unauthenticated content)
 * - !isAuthenticated → redirect to /login
 * - isSuspended → show SuspendedBanner above everything (always visible)
 * - Sidebar: fixed, left side, w-56 (expanded) or w-14 (collapsed)
 * - Header: fixed, top, left-56 (shifts with sidebar)
 * - Main: margin-left 224px + padding-top 64px (header clearance)
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/auth.context';
import SellerSidebar from '../../components/SellerSidebar';
import SellerHeader from '../../components/SellerHeader';
import { FullPageLoader } from '../../components/ui/Skeleton';
import { SuspendedBanner } from '../../components/ui/ErrorBanner';

export default function SellerMainLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const { isLoading, isAuthenticated, user } = useAuth();
  const router = useRouter();

  // Auth guard — redirect to login if not authenticated
  // Authority: architecture §10 "Auth Guard — Main Layout"
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  // Show loader while auth state is being determined
  if (isLoading || !isAuthenticated) {
    return <FullPageLoader />;
  }

  // Derive suspension status from user object
  // Authority: architecture §10 "SUSPENDED STATE (ARCH-REV-SD-13 RESOLVED)"
  const isSuspended = (
    (user as unknown as Record<string, Record<string, string>>)?.['business']?.['status'] === 'SUSPENDED'
  );

  return (
    <div className="min-h-screen bg-surface-app">
      {/* Suspended account banner — always visible above everything */}
      {isSuspended && <SuspendedBanner />}

      {/* Fixed Sidebar */}
      <SellerSidebar />

      {/* Fixed Header — positioned to the right of sidebar */}
      <SellerHeader />

      {/*
        Main content area
        - margin-left: 224px (sidebar expanded width w-56)
        - padding-top: 64px (header height h-16)
        - bg: surface-app (#F8FAFC)
        Authority: screen_system §G.1
      */}
      <main
        id="seller-main-content"
        className="ml-56 pt-16 min-h-screen bg-surface-app"
        aria-label="Main content"
      >
        {/* Skip link target */}
        <a href="#seller-main-content" className="skip-link">
          Main content pe jaiye
        </a>

        {/* Page content — max-width centered on very large screens */}
        <div className="max-w-page mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
