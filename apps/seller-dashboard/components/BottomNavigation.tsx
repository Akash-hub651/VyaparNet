"use client";

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
import { FormModal } from "./ui/Modal";

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
    { href: "/analytics", label: "Analytics", icon: <BarChart2 size={20} /> },
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
      <nav className="fixed bottom-0 left-0 right-0 h-16 bg-surface-app border-t border-border-default z-40 md:hidden pb-safe">
        <div className="flex items-center justify-around h-full px-2">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
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

      <FormModal
        isOpen={isMoreOpen}
        onClose={() => setIsMoreOpen(false)}
        title="More Options"
      >
        <div className="py-2 flex flex-col">
          {moreItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsMoreOpen(false)}
                className={`flex items-center gap-4 px-4 py-4 min-h-[56px] border-b border-border-default last:border-0 ${
                  active
                    ? "bg-brand-50 text-brand-700 font-semibold"
                    : "text-text-primary hover:bg-surface-hover"
                }`}
              >
                <span
                  className={`${active ? "text-brand-600" : "text-text-secondary"}`}
                >
                  {item.icon}
                </span>
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </FormModal>
    </>
  );
}
