"use client";

/**
 * Seller Dashboard Main Layout — apps/seller-dashboard/app/(main)/layout.tsx
 *
 * Authority:
 *   seller_dashboard_architecture.md §10 (Permission Architecture — Auth Guard)
 *   seller_dashboard_screen_system.md §G.1 (Application Shell)
 *
 * Rules:
 * - isLoading → show FullPageLoader (never flash unauthenticated content)
 * - !isAuthenticated → redirect to /login
 * - isSuspended → show SuspendedBanner above everything (always visible)
 * - Sidebar: fixed, left side, w-56 (expanded) or w-14 (collapsed)
 * - Header: fixed, top, left-56 (shifts with sidebar)
 * - Main: margin-left 224px + padding-top 64px (header clearance)
 */

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "../contexts/auth.context";
import SellerSidebar from "../../components/SellerSidebar";
import SellerHeader from "../../components/SellerHeader";
import { FullPageLoader } from "../../components/ui/Skeleton";
import { SuspendedBanner } from "../../components/ui/ErrorBanner";
import { SuspendedScreen } from "../../components/ui/ErrorScreens";
import { MobileHeader } from "../../components/MobileHeader";
import { BottomNavigation } from "../../components/BottomNavigation";
import dynamic from "next/dynamic";

const CommandPalette = dynamic(
  () => import("../../components/CommandPalette"),
  { ssr: false },
);

export default function SellerMainLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const { isLoading, isAuthenticated, user } = useAuth();
  const router = useRouter();

  // Auth guard — redirect to login if not authenticated
  // Authority: architecture §10 "Auth Guard — Main Layout"
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  const pathname = usePathname();

  // Command Palette global listener (Cmd+K / Ctrl+K and custom event)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = React.useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    const handleCustomEvent = () => setIsCommandPaletteOpen(true);

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("open-command-palette", handleCustomEvent);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-command-palette", handleCustomEvent);
    };
  }, []);

  // Show loader while auth state is being determined
  if (isLoading || !isAuthenticated) {
    return <FullPageLoader />;
  }

  // Derive suspension status from user object
  // Authority: architecture §10 "SUSPENDED STATE (ARCH-REV-SD-13 RESOLVED)"
  const isSuspended =
    (user as unknown as Record<string, Record<string, string>>)?.["business"]?.[
      "status"
    ] === "SUSPENDED";

  return (
    <div className="min-h-screen bg-surface-app">
      {/* Suspended account banner — always visible above everything */}
      {isSuspended && <SuspendedBanner />}

      {/* Global Command Palette */}
      {isCommandPaletteOpen && (
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
        />
      )}

      {/* Mobile Sidebar overlay/drawer state is managed inside SellerSidebar or locally */}
      {/* For now we just add MobileHeader which emits an event to open sidebar if needed */}
      <MobileHeader
        onMenuClick={() =>
          window.dispatchEvent(new CustomEvent("open-mobile-sidebar"))
        }
      />

      {/* Fixed Sidebar */}
      <SellerSidebar />

      {/* Fixed Header — positioned to the right of sidebar */}
      <SellerHeader />

      {/*
        Main content area
        - desktop: ml-56 pt-16
        - mobile: ml-0 pt-14 pb-16
        - bg: surface-app (#F8FAFC)
      */}
      <main
        id="seller-main-content"
        className="md:ml-56 pt-14 md:pt-16 pb-16 md:pb-0 min-h-screen bg-surface-app"
        aria-label="Main content"
      >
        {/* Skip link target */}
        <a href="#seller-main-content" className="skip-link">
          Main content pe jaiye
        </a>

        {/* Page content — max-width centered on very large screens */}
        <div className="max-w-page mx-auto p-4 md:p-6">
          {isSuspended && !pathname.startsWith("/support") ? (
            <SuspendedScreen />
          ) : (
            children
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
}
