"use client";

/**
 * CommandPalette — apps/seller-dashboard/components/CommandPalette.tsx
 *
 * Authority: seller_dashboard_screen_system.md §18.2
 *
 * Sprint 8 State: Local/Static Search & Quick Actions Only
 * No backend global search API exists yet. Renders Empty/Unavailable state for queries.
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ── MOCK DATA FOR SPRINT 8 ───────────────────────────────────── */
const PAGES = [
  { id: "page-dash", label: "Dashboard", href: "/dashboard", icon: <LayoutDashboardIcon /> },
  { id: "page-orders", label: "Orders", href: "/orders", icon: <ShoppingCartIcon /> },
  { id: "page-prod", label: "Products", href: "/products", icon: <PackageIcon /> },
  { id: "page-inv", label: "Inventory", href: "/inventory", icon: <LayersIcon /> },
  { id: "page-rfq", label: "RFQ", href: "/rfq", icon: <FileTextIcon /> },
  { id: "page-notif", label: "Notifications", href: "/notifications", icon: <BellIcon /> },
  { id: "page-settings", label: "Settings", href: "/settings", icon: <SettingsIcon /> },
];

const QUICK_ACTIONS = [
  { id: "qa-new-prod", label: "Add New Product", href: "/products/new", icon: <PlusIcon /> },
  { id: "qa-upd-stock", label: "Update Stock", href: "/inventory", icon: <MenuIcon /> },
  { id: "qa-pend-orders", label: "Pending Orders", href: "/orders?tab=pending", icon: <ShoppingCartIcon /> },
];

const RECENT = [
  { id: "rec-order", label: "#VN-00456 · Ramesh Textiles", href: "/orders/VN-00456", icon: <ShoppingCartIcon /> },
  { id: "rec-prod", label: "Cotton Kurti · CK-001", href: "/products/CK-001", icon: <PackageIcon /> },
];

/* ── ICONS ─────────────────────────────────────────────────────── */
function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function LayoutDashboardIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
}
function ShoppingCartIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>;
}
function PackageIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>;
}
function LayersIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>;
}
function FileTextIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>;
}
function BellIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
}
function SettingsIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
}
function PlusIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>;
}
function MenuIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>;
}

/* ── COMPONENT ─────────────────────────────────────────────────── */
export default function CommandPalette({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape
  useEffect(() => {
    if (!isOpen) return;
    
    // Auto focus
    setTimeout(() => inputRef.current?.focus(), 10);
    
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKey);
    };
  }, [isOpen, onClose]);

  // Derive flat list of visible items
  const items = useMemo(() => {
    if (query.trim().length > 0) return []; // Empty state for Sprint 8
    
    return [
      ...PAGES.map((i) => ({ ...i, group: "PAGES" })),
      ...QUICK_ACTIONS.map((i) => ({ ...i, group: "QUICK ACTIONS" })),
      ...RECENT.map((i) => ({ ...i, group: "RECENT" })),
    ];
  }, [query]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyNav = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (items.length === 0) return;

      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        setSelectedIndex((p) => (p + 1) % items.length);
      } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
        e.preventDefault();
        setSelectedIndex((p) => (p - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = items[selectedIndex];
        if (item) {
          router.push(item.href);
          onClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyNav);
    return () => document.removeEventListener("keydown", handleKeyNav);
  }, [isOpen, items, selectedIndex, router, onClose]);

  // Removed useEffect for query change reset

  // Auto-scroll to selected item
  useEffect(() => {
    if (!listRef.current || items.length === 0) return;
    const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement;
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, items]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-center items-start pt-[96px] px-4">
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_150ms_ease]"
        aria-hidden="true"
        onClick={onClose}
      />
      
      {/* Modal Card */}
      <div 
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        className="relative w-full max-w-xl bg-surface-card rounded-xl shadow-3 flex flex-col overflow-hidden animate-[fadeIn_200ms_ease-out]"
      >
        {/* Search Input */}
        <div className="flex items-center px-4 h-14 border-b border-border-default">
          <span className="text-text-secondary mr-3 flex-shrink-0">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none text-text-primary text-base placeholder:text-text-muted focus:outline-none focus:ring-0"
            placeholder="Search ya jump karein..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            aria-label="Search or jump to page"
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-hover"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto" ref={listRef}>
          {query.trim().length > 0 ? (
            // Phase 2 Empty State (Sprint 8 constraint)
            <div className="py-12 px-6 text-center flex flex-col items-center">
              <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center mb-4">
                <SearchIcon />
              </div>
              <p className="text-text-primary font-medium mb-1">
                &quot;{query}&quot; ke liye koi result nahi mila
              </p>
              <p className="text-sm text-text-secondary mb-6">
                Global search Sprint 10 mein aayega. Abhi ke liye, specific sections mein dhundhein:
              </p>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                <Link
                  href="/orders"
                  onClick={onClose}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-surface-hover hover:bg-surface-active text-text-primary text-sm font-medium rounded-lg transition-colors"
                >
                  Orders mein dhundho <span aria-hidden="true">&rarr;</span>
                </Link>
                <Link
                  href="/products"
                  onClick={onClose}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-surface-hover hover:bg-surface-active text-text-primary text-sm font-medium rounded-lg transition-colors"
                >
                  Products mein dhundho <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            </div>
          ) : (
            // Default View (Groups)
            <div className="py-2">
              {["PAGES", "QUICK ACTIONS", "RECENT"].map((groupName) => {
                const groupItems = items.filter((i) => i.group === groupName);
                if (groupItems.length === 0) return null;
                return (
                  <div key={groupName} className="mb-4 last:mb-0">
                    <div className="px-4 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                      {groupName}
                    </div>
                    <div>
                      {groupItems.map((item) => {
                        const globalIndex = items.indexOf(item);
                        const isSelected = globalIndex === selectedIndex;
                        return (
                          <div
                            key={item.id}
                            data-index={globalIndex}
                            className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg cursor-pointer transition-colors ${
                              isSelected ? "bg-surface-hover" : "hover:bg-surface-hover"
                            }`}
                            onClick={() => {
                              router.push(item.href);
                              onClose();
                            }}
                            onMouseEnter={() => setSelectedIndex(globalIndex)}
                          >
                            <span className="text-text-secondary flex-shrink-0">
                              {item.icon}
                            </span>
                            <span className="text-sm font-medium text-text-primary truncate">
                              {item.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-4 py-3 border-t border-border-default flex items-center justify-between text-xs text-text-muted bg-surface-header">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-border-default font-mono text-[10px]">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-border-default font-mono text-[10px]">↵</kbd> select
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-border-default font-mono text-[10px]">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
