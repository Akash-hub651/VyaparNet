"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSellerPermissions } from "../../../lib/hooks/useSellerPermissions";
import { useHeader } from "../../contexts/header.context";
import { useToast } from "../../../components/ui/Toast";
import { ProfileTab } from "./components/ProfileTab";
import { KYCTab } from "./components/KYCTab";
import { BankTab } from "./components/BankTab";
import { NotificationsTab } from "./components/NotificationsTab";

type TabKey = "profile" | "kyc" | "bank" | "notifications";

const TABS: { id: TabKey; label: string }[] = [
  { id: "profile", label: "Business Profile" },
  { id: "kyc", label: "KYC & Verification" },
  { id: "bank", label: "Bank Account" },
  { id: "notifications", label: "Notifications" },
];

export default function SettingsPage() {
  const router = useRouter();
  const { isStaff } = useSellerPermissions();
  const { setTitle } = useHeader();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [isMounted, setIsMounted] = useState(false);

  // Check Permissions
  useEffect(() => {
    if (isStaff) {
      addToast({ message: "Settings access nahi hai", variant: "error" });
      router.replace("/dashboard");
    }
  }, [isStaff, router, addToast]);

  // Handle URL Hash for Tabs
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);

    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "") as TabKey;
      if (["profile", "kyc", "bank", "notifications"].includes(hash)) {
        setActiveTab(hash);
      } else {
        setActiveTab("profile"); // fallback
      }
    };

    handleHashChange(); // Run on mount

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Update Header Title based on active tab
  useEffect(() => {
    const tabLabel =
      TABS.find((t) => t.id === activeTab)?.label || "Business Profile";
    setTitle(`Settings: ${tabLabel}`);
  }, [activeTab, setTitle]);

  if (!isMounted || isStaff) {
    return null; // Avoid hydration mismatch or rendering for unauthorized users
  }

  const handleTabClick = (tabId: TabKey) => {
    setActiveTab(tabId);
    window.history.replaceState(null, "", "#" + tabId);
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex = index;
    if (e.key === "ArrowRight") {
      nextIndex = (index + 1) % TABS.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (index - 1 + TABS.length) % TABS.length;
    }

    if (nextIndex !== index) {
      const nextTab = TABS[nextIndex];
      handleTabClick(nextTab.id);

      // Move focus to the new tab
      setTimeout(() => {
        const btn = document.getElementById(`tab-${nextTab.id}`);
        if (btn) btn.focus();
      }, 0);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* ROW A: PAGE HEADER */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
      </div>

      {/* ROW B: TABS */}
      <div className="border-b border-border-default mb-8 overflow-x-auto no-scrollbar">
        <div className="flex gap-8 min-w-max px-1" role="tablist">
          {TABS.map((tab, index) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => handleTabClick(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={`pb-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-t-sm whitespace-nowrap ${
                  isActive
                    ? "border-b-2 border-brand-600 text-brand-600"
                    : "border-b-2 border-transparent text-text-secondary hover:text-text-primary"
                }`}
                aria-selected={isActive}
                aria-controls={`tabpanel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                role="tab"
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ROW C: CONTENT AREA */}
      <div
        className="max-w-2xl"
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
      >
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "kyc" && <KYCTab />}
        {activeTab === "bank" && <BankTab />}
        {activeTab === "notifications" && <NotificationsTab />}
      </div>
    </div>
  );
}
