'use client';

/**
 * SellerSidebar — apps/seller-dashboard/components/SellerSidebar.tsx
 *
 * Authority:
 *   seller_dashboard_architecture.md §4 (NAV_GROUPS — single source of truth)
 *   seller_dashboard_architecture.md §5 (Sidebar Architecture)
 *   seller_dashboard_screen_system.md §G.3 (Sidebar Spec)
 *   seller_dashboard_uxui_system.md §11 (Navigation Architecture)
 *
 * Rules:
 * - NAV_GROUPS is the ONLY source of nav items (never hardcoded in JSX)
 * - Sidebar collapse state: localStorage (the ONLY permitted localStorage usage)
 * - Dark sidebar bg: hsl(222, 47%, 11%) = surface-sidebar
 * - Disabled items (Sprint 9+): opacity-35, cursor default, tooltip on hover
 * - Keyboard: Ctrl+B toggles, Escape closes mobile drawer
 */

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SIDEBAR_COLLAPSE_KEY } from '../lib/config';
import { formatBadgeCount } from '../lib/formatters';
import { useAuth } from '../app/contexts/auth.context';

/* ── NAV ITEM TYPES ──────────────────────────────────────────── */
interface NavItem {
  id: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Badge key to pull from badge counts state */
  badgeKey?: string;
  /** Badge type — error (red) or warning (amber) */
  badgeType?: 'error' | 'warning';
  /** Sprint 9+ items — shown but disabled */
  disabled?: boolean;
  disabledReason?: string;
}

interface NavGroup {
  id: string;
  label?: string;  // undefined = no group header (HOME group)
  items: NavItem[];
}

/* ── ICON COMPONENTS ─────────────────────────────────────────── */
const icons = {
  LayoutDashboard: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  Package: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  Layers: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  ShoppingCart: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  ),
  FileText: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  RotateCcw: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-4.46" />
    </svg>
  ),
  Shield: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  Wallet: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
      <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
      <circle cx="18" cy="12" r="2" />
    </svg>
  ),
  BarChart2: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  ),
  Settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  Bell: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  HelpCircle: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  LifeBuoy: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
      <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
      <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
      <line x1="14.83" y1="9.17" x2="18.36" y2="5.64" />
      <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
    </svg>
  ),
  ChevronLeft: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  ChevronRight: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Users: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
};

/* ── NAV GROUPS ──────────────────────────────────────────────── */
/* Authority: architecture §4 — NAV_GROUPS is the single source of truth */
const NAV_GROUPS: NavGroup[] = [
  {
    id: 'home',
    items: [
      { id: 'nav-dashboard', href: '/dashboard', label: 'Dashboard', icon: icons.LayoutDashboard },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    items: [
      { id: 'nav-products',  href: '/products',  label: 'Products',  icon: icons.Package,      badgeKey: 'rejectedCount',  badgeType: 'error'   },
      { id: 'nav-inventory', href: '/inventory', label: 'Inventory', icon: icons.Layers,       badgeKey: 'lowStockCount',  badgeType: 'warning' },
    ],
  },
  {
    id: 'commerce',
    label: 'Commerce',
    items: [
      { id: 'nav-orders', href: '/orders', label: 'Orders', icon: icons.ShoppingCart, badgeKey: 'pendingOrderCount', badgeType: 'error'   },
      { id: 'nav-rfq',    href: '/rfq',    label: 'RFQ',    icon: icons.FileText,     badgeKey: 'openRfqCount',      badgeType: 'warning' },
    ],
  },
  {
    id: 'trust',
    label: 'Trust & Safety',
    items: [
      { id: 'nav-returns',  href: '/returns',  label: 'Returns',  icon: icons.RotateCcw, disabled: true, disabledReason: 'Returns jald aayega — Sprint 9' },
      { id: 'nav-disputes', href: '/disputes', label: 'Disputes', icon: icons.Shield,    disabled: true, disabledReason: 'Disputes jald aayega — Sprint 9' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { id: 'nav-payouts', href: '/payouts', label: 'Payouts', icon: icons.Wallet, disabled: true, disabledReason: 'Payouts jald aayega — Sprint 9' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { id: 'nav-notifications', href: '/notifications', label: 'Notifications', icon: icons.Bell,     badgeKey: 'unreadNotifCount', badgeType: 'error'  },
      { id: 'nav-analytics',    href: '/analytics',     label: 'Performance',   icon: icons.BarChart2 },
    ],
  },
  {
    id: 'settings',
    label: 'Account',
    items: [
      { id: 'nav-settings', href: '/settings', label: 'Settings', icon: icons.Settings, badgeKey: 'kycPendingBadge', badgeType: 'warning' },
      { id: 'nav-team', href: '/team', label: 'Team', icon: icons.Users },
      { id: 'nav-support', href: '/support', label: 'Help & Support', icon: icons.LifeBuoy },
    ],
  },
];

/* ── BADGE COUNTS STATE ──────────────────────────────────────── */
interface BadgeCounts {
  pendingOrderCount: number;
  lowStockCount: number;
  unreadNotifCount: number;
  openRfqCount: number;
  rejectedCount: number;
  kycPendingBadge: number;
}

/* ── NAV BADGE ───────────────────────────────────────────────── */
function NavBadge({ count, type }: { count: number; type?: 'error' | 'warning' }) {
  const label = formatBadgeCount(count);
  if (!label) return null;
  return (
    <span
      aria-hidden="true"
      className={[
        'inline-flex items-center justify-center',
        'min-w-[20px] h-5 px-1.5 rounded-full',
        'text-[10px] font-semibold text-white',
        'animate-badge-spring',
        type === 'warning' ? 'bg-warning-500' : 'bg-error-500',
      ].join(' ')}
    >
      {label}
    </span>
  );
}

/* ── MAIN SIDEBAR COMPONENT ──────────────────────────────────── */
export default function SellerSidebar(): React.JSX.Element {
  const pathname = usePathname();
  const { user } = useAuth();

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === 'true';
  });

  // Stub badge counts — will be populated from KPI API in Dashboard phase
  const [badgeCounts] = useState<BadgeCounts>({
    pendingOrderCount: 0,
    lowStockCount: 0,
    unreadNotifCount: 0,
    openRfqCount: 0,
    rejectedCount: 0,
    kycPendingBadge: 0,
  });

  const toggleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(next));
      return next;
    });
  }, []);

  // Ctrl+B keyboard shortcut
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        toggleCollapse();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [toggleCollapse]);

  const sidebarWidth = isCollapsed ? 'w-14' : 'w-56';

  return (
    <aside
      aria-label="Seller navigation"
      className={[
        'flex-shrink-0 flex flex-col h-screen',
        'bg-surface-sidebar border-r border-white/5',
        'fixed top-0 left-0 bottom-0 z-[30]',
        'transition-all duration-200 ease-in-out',
        sidebarWidth,
      ].join(' ')}
    >
      {/* ── LOGO ──────────────────────────────────────────── */}
      <div className="h-14 flex items-center px-3 border-b border-white/5 flex-shrink-0">
        <Link
          href="/dashboard"
          aria-label="VyaparNet Seller — Dashboard jaiye"
          className="flex items-center gap-2.5 min-w-0"
        >
          {/* VN monogram */}
          <span className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold tracking-tight">VN</span>
          </span>
          {!isCollapsed && (
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate leading-tight">VyaparNet</p>
              <p className="text-[10px] text-white/40 leading-tight">Seller Hub</p>
            </div>
          )}
        </Link>
      </div>

      {/* ── NAVIGATION ────────────────────────────────────── */}
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-1.5 space-y-0.5"
        aria-label="Main navigation"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className="mb-1">
            {/* Group label */}
            {group.label && !isCollapsed && (
              <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30 select-none">
                {group.label}
              </p>
            )}

            {/* Nav items */}
            {group.items.map((item) => {
              const isActive = pathname ? (
                item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(item.href)
              ) : false;
              const badgeCount = item.badgeKey ? (badgeCounts[item.badgeKey as keyof BadgeCounts] ?? 0) : 0;

              if (item.disabled) {
                return (
                  <div
                    key={item.id}
                    id={item.id}
                    title={item.disabledReason}
                    aria-disabled="true"
                    className={[
                      'flex items-center gap-3 px-2.5 py-2.5 rounded-lg',
                      'opacity-35 cursor-not-allowed select-none',
                      isCollapsed ? 'justify-center' : '',
                    ].join(' ')}
                  >
                    <span className="text-white flex-shrink-0">{item.icon}</span>
                    {!isCollapsed && (
                      <span className="text-sm font-medium text-white truncate flex-1">{item.label}</span>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.id}
                  id={item.id}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'flex items-center gap-3 px-2.5 py-2.5 rounded-lg',
                    'transition-colors duration-100 ease-in-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
                    'relative group min-h-[40px]',
                    isCollapsed ? 'justify-center' : '',
                    isActive
                      ? 'bg-white/10 border-l-2 border-brand-500 text-white'
                      : 'text-white/65 hover:bg-white/[0.06] hover:text-white border-l-2 border-transparent',
                  ].join(' ')}
                >
                  {/* Icon */}
                  <span className="flex-shrink-0" aria-hidden="true">{item.icon}</span>

                  {/* Label + badge */}
                  {!isCollapsed && (
                    <>
                      <span className="text-sm font-medium truncate flex-1">{item.label}</span>
                      {badgeCount > 0 && (
                        <NavBadge count={badgeCount} type={item.badgeType} />
                      )}
                    </>
                  )}

                  {/* Collapsed tooltip */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-surface-sidebar text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-2 border border-white/10">
                      {item.label}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── SIDEBAR FOOTER ────────────────────────────────── */}
      <div className="border-t border-white/5 p-3 flex-shrink-0 flex items-center gap-2">
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">
          {user?.name?.[0]?.toUpperCase() ?? 'S'}
        </div>
        {!isCollapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">{user?.name ?? 'Seller'}</p>
            <p className="text-[10px] text-white/40 truncate">{user?.email ?? ''}</p>
          </div>
        )}
        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          aria-label={isCollapsed ? 'Sidebar expand karein' : 'Sidebar collapse karein'}
          title="Ctrl+B"
          className="flex-shrink-0 p-1 text-white/40 hover:text-white rounded transition-colors"
        >
          <span className={`block transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`}>
            {icons.ChevronLeft}
          </span>
        </button>
      </div>
    </aside>
  );
}
