'use client';

/**
 * SellerHeader — apps/seller-dashboard/components/SellerHeader.tsx
 *
 * Top header bar for seller dashboard with user info and logout.
 */

import React from 'react';
import { useAuth } from '../app/contexts/auth.context';

export default function SellerHeader(): React.JSX.Element {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header className="h-16 flex-shrink-0 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-6">
      {/* Page context - populated via aria-label on child pages */}
      <div id="seller-header-title" className="text-sm font-semibold text-[#1E293B]" aria-live="polite" />

      {/* User info */}
      <div className="flex items-center gap-4">
        {isAuthenticated && user ? (
          <>
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-[#1E293B]">{user.name}</p>
              <p className="text-xs text-[#94A3B8]">{user.email}</p>
            </div>
            <div
              className="w-8 h-8 rounded-full bg-[#EFF6FF] border-2 border-[#2563EB] flex items-center justify-center text-xs font-bold text-[#2563EB]"
              aria-hidden="true"
            >
              {user.name?.[0]?.toUpperCase() ?? 'S'}
            </div>
            <button
              id="seller-header-logout"
              onClick={() => void logout()}
              className="text-xs text-[#64748B] hover:text-[#EF4444] transition-colors font-medium"
              aria-label="Log out"
            >
              Logout
            </button>
          </>
        ) : (
          <a
            href="/login"
            className="text-sm text-[#2563EB] font-medium hover:text-[#1D4ED8]"
          >
            Login
          </a>
        )}
      </div>
    </header>
  );
}
