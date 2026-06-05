"use client";

import React from "react";
import Link from "next/link";
import { Menu, Bell } from "lucide-react";
import { useAuth } from "../app/contexts/auth.context";

interface MobileHeaderProps {
  onMenuClick: () => void;
}

export function MobileHeader({
  onMenuClick,
}: MobileHeaderProps): React.JSX.Element {
  const { user } = useAuth();
  const userName = user?.name || "Seller";

  // Get initials for avatar fallback
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-surface-app z-40 border-b border-border-default md:hidden flex items-center justify-between px-4">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onMenuClick}
          className="p-2 -ml-2 text-text-primary rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label="Open sidebar"
        >
          <Menu size={24} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 flex justify-center">
        <span className="text-base font-semibold text-brand-600">
          VyaparNet
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href="/notifications"
          className="relative p-1.5 text-text-secondary hover:text-text-primary rounded-full hover:bg-surface-hover transition-colors"
          aria-label="Notifications"
        >
          <Bell size={20} aria-hidden="true" />
          <span
            className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-error-500 ring-2 ring-surface-app"
            aria-label="Unread notifications"
          />
        </Link>
        <button
          className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center border border-brand-200 shrink-0"
          aria-label="User profile"
        >
          <span className="text-xs font-semibold text-brand-700">
            {initials}
          </span>
        </button>
      </div>
    </header>
  );
}
