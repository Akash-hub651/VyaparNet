/**
 * Seller Dashboard Main Layout — apps/seller-dashboard/app/(main)/layout.tsx
 *
 * Authority: SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md Section 9.4
 *
 * Shell with:
 * - Collapsible left sidebar (Products, Dashboard, Settings)
 * - Top header with user info and logout
 * - Main content area
 */

import React from 'react';
import type { Metadata } from 'next';
import SellerSidebar from '../../components/SellerSidebar';
import SellerHeader from '../../components/SellerHeader';

export const metadata: Metadata = {
  title: 'VyaparNet Seller Dashboard',
  description: 'Manage your wholesale products, orders, and inventory on VyaparNet.',
};

export default function SellerMainLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex h-screen bg-[#F8FAFC] overflow-hidden">
      {/* Sidebar */}
      <SellerSidebar />

      {/* Right panel: header + content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <SellerHeader />
        <main
          id="seller-main-content"
          className="flex-1 overflow-y-auto p-6"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
