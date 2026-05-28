'use client';

/**
 * SellerSidebar — apps/seller-dashboard/components/SellerSidebar.tsx
 *
 * Left navigation sidebar for seller dashboard.
 * Highlights active route.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  id: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    id: 'nav-dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="1" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="10" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="1" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <rect x="10" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    href: '/products',
    id: 'nav-products',
    label: 'Products',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path d="M2 5L9 1L16 5V13L9 17L2 13V5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9 1V17M2 5L16 13M16 5L2 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/inventory',
    id: 'nav-inventory',
    label: 'Inventory',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect x="2" y="2" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 6h6M6 10h6M6 14h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/settings',
    id: 'nav-settings',
    label: 'Settings',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.22 3.22l1.42 1.42M13.36 13.36l1.42 1.42M3.22 14.78l1.42-1.42M13.36 4.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function SellerSidebar(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <aside
      className="w-56 flex-shrink-0 bg-white border-r border-[#E2E8F0] flex flex-col"
      aria-label="Seller navigation"
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-[#E2E8F0]">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-[#2563EB] font-bold text-base font-heading"
          aria-label="VyaparNet Seller — Go to dashboard"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect width="24" height="24" rx="5" fill="#2563EB" />
            <text x="3" y="17" fill="white" fontSize="11" fontWeight="700" fontFamily="sans-serif">VN</text>
          </svg>
          <span>Seller Hub</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              id={item.id}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[#EFF6FF] text-[#2563EB]'
                  : 'text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#1E293B]'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={isActive ? 'text-[#2563EB]' : 'text-[#94A3B8]'}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom info */}
      <div className="p-4 border-t border-[#E2E8F0]">
        <p className="text-xs text-[#94A3B8]">Sprint 3 — Inventory</p>
      </div>
    </aside>
  );
}
