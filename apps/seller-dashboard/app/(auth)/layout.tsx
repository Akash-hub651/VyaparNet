/**
 * Auth Layout — apps/seller-dashboard/app/(auth)/layout.tsx
 *
 * Authority: seller_dashboard_architecture.md §8 (Module Directory Architecture)
 * "(auth)/login/page.tsx — Seller login (OTP flow)"
 *
 * Auth pages (login) have NO sidebar, NO header.
 * The layout is a clean full-screen container.
 *
 * Security: If user is already authenticated and visits /login,
 * the login page itself redirects to /dashboard.
 * This layout does NOT add auth guards — that's the page's responsibility.
 */

import React from 'react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="min-h-screen bg-surface-app">
      {children}
    </div>
  );
}
