"use client";

/**
 * BottomNavigation — apps/seller-dashboard/components/BottomNavigation.tsx
 *
 * Authority: seller_dashboard_screen_system.md §G.12 (Mobile Navigation)
 *
 * D-06 FIX: "More" sheet now uses BottomSheet component instead of FormModal.
 * BottomSheet provides: slide-up animation, handle bar, swipe-to-close, focus trap.
 */

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Layers,
  MoreHorizontal,
  Package,
  FileText,
  BarChart2,
  Settings,
  LifeBuoy,
} from "lucide-react";
import { BottomSheet } from "./ui/BottomSheet";

export function BottomNavigation(): React.JSX.Element {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const navItems = [
    { href: "/dashboard", label: "Home", icon: <LayoutDashboard size={24} /> },
    { href: "/orders", label: "Orders", icon: <ShoppingCart size={24} /> },
    { href: "/inventory", label: "Inventory", icon: <Layers size={24} /> },
  ];

  const moreItems = [
    { href: "/products", label: "Products", icon: <Package size={20} /> },
    { href: "/rfq", label: "RFQs", icon: <FileText size={20} /> },
    /**
     * D-04 FIX (residual) — Label matches sidebar label "Performance"
     * Authority: seller_dashboard_architecture.md §4 (ARCH-REV-SD-18 RESOLVED)
     */
    { href: "/analytics", label: "Performance", icon: <BarChart2 size={20} /> },
    { href: "/settings", label: "Settings", icon: <Settings size={20} /> },
    { href: "/support", label: "Support", icon: <LifeBuoy size={20} /> },
  ];

  const isActive = (path: string) => {
    if (path === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(path);
  };

  const isMoreActive = moreItems.some((item) => isActive(item.href));

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 h-16 bg-surface-app border-t border-border-default z-40 md:hidden pb-safe"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-around h-full px-2">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
                  active ? "text-brand-600" : "text-text-secondary"
                }`}
              >
                <div
                  aria-hidden="true"
                  className={`${active ? "fill-current" : ""}`}
                >
                  {item.icon}
                </div>
                <span className="text-[10px] font-medium leading-none">
                  {item.label}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setIsMoreOpen(true)}
            aria-expanded={isMoreOpen}
            aria-haspopup="dialog"
            aria-label="More navigation options"
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
              isMoreActive || isMoreOpen
                ? "text-brand-600"
                : "text-text-secondary"
            }`}
          >
            <div aria-hidden="true">
              <MoreHorizontal size={24} />
            </div>
            <span className="text-[10px] font-medium leading-none">More</span>
          </button>
        </div>
      </nav>

      {/**
       * D-06 FIX: BottomSheet replaces FormModal for the "More" menu.
       * Spec: screen_system §G.12 "AUR Bottom Sheet"
       * Provides: slide-up from bottom, handle bar (36×4px), swipe-to-close,
       *   focus trap, Escape key, backdrop, safe area padding.
       */}
      <BottomSheet
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title="Aur Options"
      >
        <div className="py-2 flex flex-col">
          {moreItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMoreOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-4 px-5 py-4 min-h-[56px] border-b border-border-default last:border-0 transition-colors ${
                  active
                    ? "bg-brand-50 text-brand-700 font-semibold"
                    : "text-text-primary hover:bg-surface-hover active:bg-surface-selected"
                }`}
              >
                <span
                  className={`${active ? "text-brand-600" : "text-text-secondary"}`}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
