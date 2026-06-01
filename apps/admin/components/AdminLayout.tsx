import React from 'react';
import Link from 'next/link';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
}

interface AdminLayoutProps {
  children: React.ReactNode;
  title?: string;
  /** Badge counts for nav items — exception count for sidebar alerts */
  exceptionCount?: number;
}

const navItems: NavItem[] = [
  { href: '/businesses', label: 'Businesses', icon: '🏢' },
  { href: '/products', label: 'Products', icon: '📦' },
  { href: '/users', label: 'Users', icon: '👤' },
  { href: '/orders', label: 'Orders', icon: '📋' },
  { href: '/finance', label: 'Finance', icon: '💰' },
  { href: '/flags', label: 'Feature Flags', icon: '🚩' },
  { href: '/audit', label: 'Audit Log', icon: '📜' },
  { href: '/exceptions', label: 'Exceptions', icon: '⚠️' },
  { href: '/tickets', label: 'Support', icon: '🎫' },
];

export default function AdminLayout({
  children,
  title,
  exceptionCount = 0,
}: AdminLayoutProps): React.JSX.Element {
  return (
    <div className="flex h-screen bg-[#F8FAFC] text-[#1E293B]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1E293B] text-white flex flex-col flex-shrink-0 overflow-y-auto">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-[#334155]">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-bold text-white">VyaparNet</span>
          </Link>
          <p className="text-[#64748B] text-xs mt-1">Admin Panel</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const hasAlert = item.href === '/exceptions' && exceptionCount > 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-[#94A3B8] hover:bg-[#334155] hover:text-white transition-colors text-sm"
              >
                <span className="flex items-center gap-3">
                  <span>{item.icon}</span>
                  {item.label}
                </span>
                {hasAlert && (
                  <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                    {exceptionCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom logout */}
        <div className="px-3 py-4 border-t border-[#334155]">
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[#94A3B8] hover:bg-[#334155] hover:text-red-400 transition-colors text-sm"
            >
              <span>🚪</span>
              Logout
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top header */}
        {title && (
          <header className="bg-white border-b border-[#E2E8F0] px-8 py-4 flex-shrink-0">
            <h1 className="text-[20px] font-semibold text-[#1E293B]">{title}</h1>
          </header>
        )}

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
