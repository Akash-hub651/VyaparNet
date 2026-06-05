"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useHeader } from "../../contexts/header.context";
import { useAuth } from "../../contexts/auth.context";
import { useSellerPermissions } from "../../../lib/hooks/useSellerPermissions";
import {
  getSellerRfqs,
  adaptRfqToViewModel,
  RfqViewModel,
  RfqStatus,
} from "../../../lib/api/rfq.client";
import { ErrorBanner } from "../../../components/ui/ErrorBanner";
import { RfqTable } from "./components/RfqTable";
import { RfqMobileList } from "./components/RfqMobileList";
import { RfqEmptyState } from "./components/RfqEmptyState";
import { RfqFilterDrawer, RfqFilters } from "./components/RfqFilterDrawer";

export default function RfqListPage() {
  const { setTitle } = useHeader();
  const { user, accessToken: token } = useAuth();
  const permissions = useSellerPermissions();

  const [items, setItems] = useState<RfqViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs
  type TabType = RfqStatus | "ALL";
  const [activeTab, setActiveTab] = useState<TabType>("NOT_QUOTED");

  // Sorting
  const [sortByExpiry, setSortByExpiry] = useState<boolean>(false);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<RfqFilters>({
    segments: [],
    statuses: [],
    budgetMin: "",
    budgetMax: "",
    expiry: "",
    showClosed: false,
  });

  useEffect(() => {
    setTitle("RFQ Center");
  }, [setTitle]);

  // Load Data
  useEffect(() => {
    async function loadData() {
      if (!token) return;
      try {
        setLoading(true);
        setError(null);
        const res = await getSellerRfqs({}, token);
        if (res.error) {
          setError(res.error.message);
        } else {
          setItems(res.data.data.map(adaptRfqToViewModel));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load RFQs");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [token]);

  // Derived state: Expiry Alert
  const expiringCount = useMemo(() => {
    if (!items.length) return 0;
    const now = new Date().getTime();
    return items.filter((r) => {
      const diffMs = new Date(r.expiresAt).getTime() - now;
      const hours = diffMs / (1000 * 60 * 60);
      return hours > 0 && hours < 2 && r.status === "NOT_QUOTED";
    }).length;
  }, [items]);

  // Derived state: Tab Counts
  const counts = useMemo(() => {
    return {
      NOT_QUOTED: items.filter((i) => i.status === "NOT_QUOTED").length,
      QUOTED: items.filter((i) => i.status === "QUOTED").length,
      EXPIRED: items.filter((i) => i.status === "EXPIRED").length,
      WON: items.filter((i) => i.status === "WON").length,
      LOST: items.filter((i) => i.status === "LOST").length,
    };
  }, [items]);

  // Filtering
  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      // 1. Tab filtering
      if (activeTab !== "ALL" && item.status !== activeTab) return false;

      // 2. Search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matches =
          item.rfqId.toLowerCase().includes(query) ||
          item.productRequired.toLowerCase().includes(query) ||
          item.segment.toLowerCase().includes(query);
        if (!matches) return false;
      }

      // 3. Drawer Filters
      if (
        filters.segments.length > 0 &&
        !filters.segments.includes(item.segment)
      )
        return false;
      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(item.status)
      )
        return false;
      if (
        filters.budgetMin &&
        (item.budgetMax || 0) < parseInt(filters.budgetMin, 10)
      )
        return false;
      if (
        filters.budgetMax &&
        (item.budgetMin || Infinity) > parseInt(filters.budgetMax, 10)
      )
        return false;

      // Filter showClosed
      if (
        !filters.showClosed &&
        (item.status === "EXPIRED" ||
          item.status === "LOST" ||
          item.status === "WON")
      ) {
        // If they explicitly clicked a closed tab, let it override
        if (
          activeTab !== "EXPIRED" &&
          activeTab !== "WON" &&
          activeTab !== "LOST"
        ) {
          return false;
        }
      }

      return true;
    });

    if (sortByExpiry) {
      return [...filtered].sort(
        (a, b) =>
          new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
      );
    }

    return filtered;
  }, [items, activeTab, searchQuery, filters, sortByExpiry]);

  // Auth/Role Gates
  if (!user || !permissions) return null;

  // KYC GATE BLOCKER
  if (user.businesses?.[0]?.kycStatus !== "VERIFIED") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-md mx-auto px-6">
        <div className="w-16 h-16 bg-warning-50 text-warning-500 rounded-full flex items-center justify-center mb-6">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">
          RFQ ke liye KYC zaroori hai
        </h2>
        <p className="text-sm text-text-secondary mb-8">
          Buyers ke saath deal karne ke liye pehle verification complete karein.
        </p>
        <a
          href="/settings#kyc"
          className="inline-flex items-center justify-center w-full px-4 py-2.5 text-sm font-medium bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-colors"
        >
          KYC Complete Karein{" "}
          <span aria-hidden="true" className="ml-2">
            →
          </span>
        </a>
      </div>
    );
  }

  const hasAnyFilters =
    searchQuery.length > 0 ||
    filters.segments.length > 0 ||
    filters.statuses.length > 0 ||
    filters.budgetMin !== "" ||
    filters.budgetMax !== "";

  return (
    <div className="space-y-6">
      {/* Expiry Alert */}
      {expiringCount > 0 && activeTab !== "QUOTED" && (
        <div className="bg-error-50 border-l-4 border-error-500 p-4 rounded-r-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-error-700">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium">
              ⏰ {expiringCount} RFQs 2 ghante mein expire ho rahe hain — jaldi
              quote karein!
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab("NOT_QUOTED");
              setSortByExpiry(true);
            }}
            className="text-sm font-bold text-error-700 hover:text-error-800 self-start sm:self-auto whitespace-nowrap"
          >
            Expiring RFQs Dekho <span aria-hidden="true">→</span>
          </button>
        </div>
      )}

      {permissions.isSuspended && (
        <ErrorBanner message="Aapka account suspended hai. Aap nayi quote submit nahi kar sakte, sirf purani quote dekh sakte hain." />
      )}

      {error && <ErrorBanner message={`Data Error: ${error}`} />}

      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-text-primary">RFQ Center</h1>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700">
            {filteredItems.length} RFQs
          </span>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-neutral-200 overflow-x-auto scrollbar-hide">
        <nav className="flex items-center gap-6 min-w-max" aria-label="Tabs">
          {[
            { id: "ALL", label: "All" },
            { id: "NOT_QUOTED", label: `Not Quoted ●${counts.NOT_QUOTED}` },
            { id: "QUOTED", label: `Quoted (${counts.QUOTED})` },
            { id: "EXPIRED", label: "Expired" },
            { id: "WON", label: "Won" },
            { id: "LOST", label: "Lost" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`py-3 px-1 text-sm font-medium border-b-2 whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-t-sm ${
                  isActive
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-text-secondary hover:text-text-primary hover:border-neutral-300"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Secondary Bar (Search & Filter) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg
              className="h-4 w-4 text-neutral-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-3 py-2 border border-neutral-300 rounded-md leading-5 bg-surface-base placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500 sm:text-sm"
            placeholder="Product naam ya segment search karein..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSortByExpiry(!sortByExpiry)}
            className={`inline-flex items-center px-3 py-2 border shadow-sm text-sm font-medium rounded-md transition-colors ${
              sortByExpiry
                ? "border-brand-300 text-brand-700 bg-brand-50"
                : "border-neutral-300 text-text-primary bg-surface-base hover:bg-neutral-50"
            }`}
          >
            Sort by Expiry {sortByExpiry ? "▲" : "▾"}
          </button>
          <button
            type="button"
            onClick={() => setIsFilterOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 border border-neutral-300 shadow-sm text-sm font-medium rounded-md text-text-primary bg-surface-base hover:bg-neutral-50 relative"
          >
            <svg
              className="w-4 h-4 text-neutral-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            Filter ≡
            {(filters.segments.length > 0 || filters.statuses.length > 0) && (
              <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-brand-600 border-2 border-surface-base rounded-full"></span>
            )}
          </button>
        </div>
      </div>

      {/* Active Filter Chips */}
      {hasAnyFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.segments.map((seg) => (
            <span
              key={seg}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700"
            >
              Segment: {seg.replace(/_/g, " ").toLowerCase()}
              <button
                type="button"
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    segments: f.segments.filter((s) => s !== seg),
                  }))
                }
                className="text-neutral-500 hover:text-neutral-700"
              >
                ×
              </button>
            </span>
          ))}
          {filters.statuses.map((st) => (
            <span
              key={st}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700"
            >
              Status: {st}
              <button
                type="button"
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    statuses: f.statuses.filter((s) => s !== st),
                  }))
                }
                className="text-neutral-500 hover:text-neutral-700"
              >
                ×
              </button>
            </span>
          ))}
          {filters.budgetMin && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700">
              Min ₹{filters.budgetMin}
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, budgetMin: "" }))}
                className="text-neutral-500 hover:text-neutral-700"
              >
                ×
              </button>
            </span>
          )}
          {filters.budgetMax && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700">
              Max ₹{filters.budgetMax}
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, budgetMax: "" }))}
                className="text-neutral-500 hover:text-neutral-700"
              >
                ×
              </button>
            </span>
          )}
          {filters.expiry && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700">
              Expiry: {filters.expiry}
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, expiry: "" }))}
                className="text-neutral-500 hover:text-neutral-700"
              >
                ×
              </button>
            </span>
          )}
          {filters.showClosed && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700">
              Closed Included
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, showClosed: false }))}
                className="text-neutral-500 hover:text-neutral-700"
              >
                ×
              </button>
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setFilters({
                segments: [],
                statuses: [],
                budgetMin: "",
                budgetMax: "",
                expiry: "",
                showClosed: false,
              });
            }}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 px-2"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {filteredItems.length > 0 || loading ? (
        <>
          <div className="hidden md:block">
            <RfqTable
              items={filteredItems}
              isLoading={loading}
              canQuote={
                permissions.canSubmitRfqQuote && !permissions.isSuspended
              }
            />
          </div>
          <div className="block md:hidden">
            <RfqMobileList
              items={filteredItems}
              isLoading={loading}
              canQuote={
                permissions.canSubmitRfqQuote && !permissions.isSuspended
              }
            />
          </div>
        </>
      ) : (
        <RfqEmptyState
          currentTab={activeTab}
          hasFilters={hasAnyFilters}
          onClearFilters={() => {
            setSearchQuery("");
            setFilters({
              segments: [],
              statuses: [],
              budgetMin: "",
              budgetMax: "",
              expiry: "",
              showClosed: false,
            });
          }}
        />
      )}

      {/* Drawer */}
      <RfqFilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onApply={setFilters}
        onReset={() =>
          setFilters({
            segments: [],
            statuses: [],
            budgetMin: "",
            budgetMax: "",
            expiry: "",
            showClosed: false,
          })
        }
      />
    </div>
  );
}
