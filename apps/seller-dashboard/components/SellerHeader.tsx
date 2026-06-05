"use client";

/**
 * SellerHeader — apps/seller-dashboard/components/SellerHeader.tsx
 *
 * Authority:
 *   seller_dashboard_architecture.md §6 (Top Navigation Architecture)
 *   seller_dashboard_screen_system.md §G.2 (Header Component)
 *
 * Sections (left to right):
 *   1. Breadcrumb / Page title (dynamic via heading)
 *   2. ⌘K Search trigger (pill button)
 *   3. KYC Status Chip (VERIFIED/PENDING/REJECTED)
 *   4. Notification Bell (with unread count badge)
 *   5. Account Avatar Dropdown (name, settings links, sign out)
 *
 * Rules:
 * - KYC PENDING/REJECTED chip: links to /settings#kyc
 * - SUSPENDED state: SuspendedBanner shown from (main)/layout.tsx (not here)
 * - Notification bell: opens /notifications (not drawer — Sprint 9)
 * - Avatar dropdown: standard dropdown menu
 */

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../app/contexts/auth.context";
import { NotificationDrawer } from "./NotificationDrawer";

/* ── KYC STATUS CHIP ─────────────────────────────────────────── */
function KycChip({ kycStatus }: { kycStatus: string | null | undefined }) {
  if (!kycStatus || kycStatus === "VERIFIED") {
    return kycStatus === "VERIFIED" ? (
      <div className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-success-100 border border-success-100">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-success-500 flex-shrink-0"
          aria-hidden="true"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <span className="text-xs font-medium text-success-700 hidden sm:block">
          KYC Verified
        </span>
        <span className="w-2 h-2 rounded-full bg-success-500 sm:hidden" />
      </div>
    ) : null;
  }

  const isPending = kycStatus === "PENDING";
  return (
    <Link
      href="/settings#kyc"
      aria-label={`KYC status: ${isPending ? "Pending" : "Rejected"} — settings mein jaiye`}
      className={[
        "flex items-center gap-1.5 h-8 px-3 rounded-full border transition-opacity hover:opacity-80",
        isPending
          ? "bg-warning-100 border-warning-100"
          : "bg-error-100 border-error-100",
      ].join(" ")}
    >
      {isPending ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-warning-500 flex-shrink-0"
          aria-hidden="true"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-error-500 flex-shrink-0"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      )}
      <span
        className={`text-xs font-medium hidden sm:block ${isPending ? "text-warning-700" : "text-error-700"}`}
      >
        {isPending ? "KYC Pending" : "KYC Rejected"}
      </span>
      <span
        className={`w-2 h-2 rounded-full sm:hidden ${isPending ? "bg-warning-500 animate-pulse" : "bg-error-500"}`}
      />
    </Link>
  );
}

/* ── NOTIFICATION BELL ───────────────────────────────────────── */
function NotificationBell({
  unreadCount = 0,
  onOpenDrawer,
}: {
  unreadCount?: number;
  onOpenDrawer: () => void;
}) {
  const label =
    unreadCount > 0
      ? `Notifications — ${unreadCount > 99 ? "99+" : unreadCount} unread`
      : "Notifications";
  const badgeText =
    unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <button
      onClick={onOpenDrawer}
      aria-label={label}
      className="relative p-2 text-text-secondary hover:text-text-primary rounded-lg hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {badgeText && (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-error-500 text-white text-[10px] font-semibold flex items-center justify-center animate-badge-spring"
        >
          {badgeText}
        </span>
      )}
    </button>
  );
}

/* ── AVATAR DROPDOWN ─────────────────────────────────────────── */
function AvatarDropdown({
  user,
  onLogout,
}: {
  user: { name?: string | null; email?: string | null } | null;
  onLogout: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initials = (user?.name ?? "").slice(0, 2).toUpperCase() || "S";

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        id="seller-avatar-trigger"
        onClick={() => setIsOpen((p) => !p)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`Account menu — ${user?.name ?? "Seller"}`}
        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="hidden md:block text-left">
          <p className="text-sm font-medium text-text-primary leading-tight truncate max-w-[120px]">
            {user?.name ?? "Seller"}
          </p>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          className={`text-text-muted hidden md:block transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-labelledby="seller-avatar-trigger"
          className="absolute right-0 top-full mt-1.5 w-52 bg-surface-card rounded-xl shadow-3 border border-border-default z-50 overflow-hidden"
        >
          {/* User info header */}
          <div className="px-4 py-3 border-b border-border-default">
            <p className="text-sm font-semibold text-text-primary truncate">
              {user?.name ?? "Seller"}
            </p>
            <p className="text-xs text-text-muted truncate">
              {user?.email ?? ""}
            </p>
          </div>

          {/* Menu items */}
          {[
            { label: "👤 Profile Settings", href: "/settings#profile" },
            { label: "🏢 Business Profile", href: "/settings#profile" },
            { label: "💳 KYC & Verification", href: "/settings#kyc" },
            { label: "🔔 Notification Prefs", href: "/settings#notif" },
          ].map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              role="menuitem"
              onClick={() => setIsOpen(false)}
              className="flex items-center px-4 py-2.5 text-sm text-text-primary hover:bg-surface-hover transition-colors"
            >
              {item.label}
            </Link>
          ))}

          {/* Divider + Sign Out */}
          <div className="border-t border-border-default">
            <button
              id="seller-header-logout"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
              className="w-full flex items-center px-4 py-2.5 text-sm text-error-600 hover:bg-error-50 transition-colors text-left"
            >
              🚪 Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── BREADCRUMB ──────────────────────────────────────────────── */
function Breadcrumb() {
  const pathname = usePathname();
  const segments = (pathname ?? "/dashboard")
    .split("/")
    .filter(Boolean)
    .slice(0, 3); // max 3 levels per spec

  if (segments.length === 0) return null;

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
      {segments.map((seg, i) => {
        const isLast = i === segments.length - 1;
        const href = "/" + segments.slice(0, i + 1).join("/");
        const label = capitalize(seg.replace(/-/g, " "));
        return (
          <React.Fragment key={href}>
            {i > 0 && <span className="text-text-muted">/</span>}
            {isLast ? (
              <span className="font-semibold text-text-primary truncate max-w-[200px]">
                {label}
              </span>
            ) : (
              <Link
                href={href}
                className="text-text-secondary hover:text-text-primary transition-colors truncate max-w-[120px]"
              >
                {label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/* ── MAIN HEADER ─────────────────────────────────────────────── */
export default function SellerHeader(): React.JSX.Element {
  const { user, isAuthenticated, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  // Derive KYC status from user object
  const kycStatus = (user as unknown as Record<string, unknown>)?.["business"]
    ? ((user as unknown as Record<string, { kycStatus?: string }>)?.["business"]
        ?.kycStatus ?? null)
    : null;

  const isNotificationsPage = pathname === "/notifications";

  return (
    <>
      <header
        id="seller-header"
        className={[
          "h-16 flex-shrink-0 fixed top-0 right-0",
          "left-0 md:left-56",
          "bg-surface-header border-b border-border-default",
          "flex items-center justify-between px-4 md:px-6 gap-4",
          "z-[40]",
        ].join(" ")}
      >
        {/* LEFT: Breadcrumb / Mobile Nav */}
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {/* Mobile Back Button (FA-05 FIX) */}
          {isNotificationsPage && (
            <button
              onClick={() => router.back()}
              aria-label="Pichhe jaiye"
              className="md:hidden p-2 -ml-2 text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}

          <div className={isNotificationsPage ? "hidden md:block" : "block"}>
            <Breadcrumb />
          </div>
          {isNotificationsPage && (
            <h1 className="md:hidden text-lg font-bold text-text-primary">
              Notifications
            </h1>
          )}
        </div>

        {/* CENTER: ⌘K Search trigger */}
        <button
          aria-label="Search ya jump karein (Cmd+K)"
          className="hidden md:flex items-center gap-2 h-9 px-3 rounded-full border border-border-default bg-surface-hover text-text-muted text-sm hover:border-border-strong transition-colors"
          style={{ width: "240px" }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="flex-1 text-left">Search ya jump karein...</span>
          <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-border-default text-text-muted font-mono">
            ⌘K
          </kbd>
        </button>

        {/* RIGHT: KYC + Bell + Avatar */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAuthenticated && (
            <>
              <KycChip kycStatus={kycStatus} />
              <NotificationBell
                unreadCount={0}
                onOpenDrawer={() => setDrawerOpen(true)}
              />
              <AvatarDropdown user={user} onLogout={() => void logout()} />
            </>
          )}
          {!isAuthenticated && (
            <Link
              href="/login"
              className="text-sm text-brand-600 font-medium hover:text-brand-700 transition-colors"
            >
              Login
            </Link>
          )}
        </div>
      </header>
      <NotificationDrawer
        isOpen={isDrawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </>
  );
}
