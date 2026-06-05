"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useHeader } from "../../contexts/header.context";
import { useAuth } from "../../contexts/auth.context";
import { useSellerPermissions } from "../../../lib/hooks/useSellerPermissions";
import {
  getOrders,
  OrderPreviewDto,
  OrderStatus,
} from "../../../lib/api/orders.client";
import { ErrorBanner } from "../../../components/ui/ErrorBanner";
import {
  Download,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ListFilter,
  RotateCw,
  X,
} from "lucide-react";
import { OrdersTable } from "./OrdersTable";
import { OrdersMobileList } from "./components/OrdersMobileList";
import { PullToRefresh } from "../../../components/ui/PullToRefresh";
import { BulkActionBar } from "./BulkActionBar";
import { BulkShippingModal } from "./BulkShippingModal";
import { FilterDrawer, OrderFilterState, EMPTY_ORDER_FILTER } from "./FilterDrawer";
import { useColumnCustomization, ColumnDef } from "../../../components/hooks/useColumnCustomization";
import { ColumnCustomizer } from "../../../components/ui/ColumnCustomizer";

const ORDER_COLUMNS: ColumnDef[] = [
  { id: 'order_number', label: 'Order #', isMandatory: true },
  { id: 'amount', label: 'Amount' },
  { id: 'status', label: 'Status' },
  { id: 'created_at', label: 'Age' },
  { id: 'segment', label: 'Segment' },
  { id: 'actions', label: 'Actions', isMandatory: true },
];
import { MobileOrderSearchOverlay } from "./components/MobileOrderSearchOverlay";

const STATUS_TABS: { label: string; value: OrderStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PLACED" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Processing", value: "PROCESSING" },
  { label: "Shipped", value: "SHIPPED" },
  { label: "Delivered", value: "DELIVERED" },
  { label: "Cancelled", value: "CANCELLED" },
];

export default function SellerOrdersPage() {
  const { setTitle } = useHeader();
  const { accessToken } = useAuth();
  const perms = useSellerPermissions();

  useEffect(() => {
    setTitle("Orders");
  }, [setTitle]);

  // State
  const [orders, setOrders] = useState<OrderPreviewDto[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [totalCount, setTotalCount] = useState<number>(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Filters & Sorting
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">(
    "PLACED",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortParam, setSortParam] = useState<"amount" | "created_at">(
    "created_at",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Selection
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(
    new Set(),
  );

  // UI State
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [isBulkShipModalOpen, setIsBulkShipModalOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // Filter Drawer state — MEDIUM-BL1 FIX: active filters are lifted here and
  // passed to getOrders() API params
  const [activeOrderFilters, setActiveOrderFilters] = useState<OrderFilterState>(EMPTY_ORDER_FILTER);

  const columnCust = useColumnCustomization("orders", ORDER_COLUMNS);
  const [isAutoRefreshOn, setIsAutoRefreshOn] = useState(true);
  const [newOrdersToast, setNewOrdersToast] = useState<{
    count: number;
  } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const handleClearFilters = useCallback(() => {
    setStatusFilter("ALL");
    setSearchQuery("");
    setDebouncedSearch("");
    setActiveOrderFilters(EMPTY_ORDER_FILTER);
  }, []);

  // Search Debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery.length >= 2 || searchQuery.length === 0) {
        setDebouncedSearch(searchQuery);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch Logic
  const fetchOrders = useCallback(
    async (isLoadMore = false, overrideCursor: string | null = null) => {
      if (!accessToken) return;
      if (perms.businessMissing) {
        setIsLoading(false);
        return;
      }

      const currentCursor = isLoadMore ? overrideCursor || nextCursor : null;

      if (!isLoadMore) setIsLoading(true);
      else setIsLoadingMore(true);

      setError(null);

      const res = await getOrders(
        {
          cursor: currentCursor,
          limit: 20,
          status: statusFilter,
          search: debouncedSearch,
          sort: sortParam,
          dir: sortDir,
        },
        accessToken,
      );

      if (!res.success) {
        setError(new Error(res.error));
      } else {
        if (isLoadMore) {
          setOrders((prev) => [...prev, ...res.data.data]);
        } else {
          setOrders(res.data.data);
        }
        setNextCursor(res.data.nextCursor);
        setTotalCount(res.data.totalCount);
        setCounts(res.data.counts);
      }

      setIsLoading(false);
      setIsLoadingMore(false);
    },
    [
      accessToken,
      perms.businessMissing,
      statusFilter,
      debouncedSearch,
      sortParam,
      sortDir,
      nextCursor,
    ],
  );

  // Initial Load & Filter Changes
  useEffect(() => {
    fetchOrders(false);

    setSelectedOrderIds(new Set()); // Clear selection on filter change
  }, [statusFilter, debouncedSearch, sortParam, sortDir, fetchOrders]);

  // Auto-refresh logic (M-02 FIX)
  useEffect(() => {
    if (!isAutoRefreshOn || !accessToken || perms.businessMissing) return;

    const interval = setInterval(async () => {
      // Fetch latest orders without cursor to check for changes
      const res = await getOrders(
        {
          limit: 20,
          status: statusFilter,
          search: debouncedSearch,
          sort: sortParam,
          dir: sortDir,
        },
        accessToken,
      );

      if (res.success) {
        setOrders((currentOrders) => {
          const fetchedOrders = res.data.data;
          // Check for completely new orders not in our list
          const currentIds = new Set(currentOrders.map((o) => o.id));
          const completelyNewOrders = fetchedOrders.filter(
            (o: OrderPreviewDto) => !currentIds.has(o.id),
          );

          if (completelyNewOrders.length > 0) {
            setNewOrdersToast({ count: completelyNewOrders.length });
          }

          // Merge updates silently
          return currentOrders.map((order) => {
            const updated = fetchedOrders.find(
              (f: OrderPreviewDto) => f.id === order.id,
            );
            return updated ? updated : order;
          });
        });
        setCounts(res.data.counts);
      }
    }, 90000); // 90 seconds

    return () => clearInterval(interval);
  }, [
    isAutoRefreshOn,
    accessToken,
    perms.businessMissing,
    statusFilter,
    debouncedSearch,
    sortParam,
    sortDir,
  ]);

  const handleManualRefresh = () => {
    setNewOrdersToast(null);
    fetchOrders(false);
  };

  const handleSort = (param: "amount" | "created_at") => {
    if (sortParam === param) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortParam(param);
      setSortDir("desc");
    }
  };

  const handleExport = () => {
    // Client-side CSV generation per spec
    const csvContent = [
      [
        "Order Number",
        "Buyer Name",
        "Amount",
        "Status",
        "Segment",
        "Created At",
      ],
      ...orders.map((o) => [
        o.orderNumber,
        o.buyerName,
        o.amount,
        o.status,
        o.segment,
        o.createdAt,
      ]),
    ]
      .map((e) => e.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute(
      "download",
      `vyaparnet_orders_${dateStr}_${orders.length}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (perms.businessMissing) {
    return (
      <div className="p-6">
        <ErrorBanner message="Aapka business profile nahi mila. System error." />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto flex flex-col gap-6">
      {/* ROW A: PAGE HEADER */}
      <div className="flex justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl sm:text-2xl text-lg font-bold text-text-primary">
            Orders
          </h1>
          <span className="px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-700 text-sm font-medium border border-neutral-200">
            {totalCount} <span className="hidden sm:inline">orders</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Mobile Search Trigger */}
          <button
            className="md:hidden p-2 text-text-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-md"
            onClick={() => setIsMobileSearchOpen(true)}
            aria-label="Orders search karein"
          >
            <Search size={20} />
          </button>

          {!perms.isSuspended && !perms.businessMissing && (
            <button
              onClick={handleExport}
              className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-md border border-border-default transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Download size={16} />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* ROW B: TAB FILTER BAR */}
      <div className="border-b border-border-default w-full overflow-x-auto no-scrollbar">
        <div className="flex min-w-max" role="tablist">
          {STATUS_TABS.map((tab) => {
            const isActive = statusFilter === tab.value;
            const count = counts[tab.value] || 0;
            return (
              <button
                key={tab.value}
                role="tab"
                aria-selected={isActive}
                onClick={() => setStatusFilter(tab.value)}
                className={`relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  isActive
                    ? "text-brand-600"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <div className="flex items-center gap-2">
                  {tab.label}
                  {/* Pending dot */}
                  {tab.value === "PLACED" && count > 0 && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-error-50 text-error-700 text-[10px] font-bold border border-error-100">
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-error-500"
                        aria-hidden="true"
                      ></span>
                      {count}
                    </span>
                  )}
                  {tab.value !== "PLACED" && count > 0 && (
                    <span className="text-xs text-text-muted">({count})</span>
                  )}
                </div>
                {isActive && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-600"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* AUTO REFRESH TOAST OVERLAY (M-02 FIX) */}
      {newOrdersToast && (
        <div className="flex items-center justify-between bg-brand-50 border-l-4 border-brand-600 p-3 rounded shadow-1 animate-fade-in">
          <span className="text-sm font-medium text-brand-800">
            {newOrdersToast.count} naye orders aaye
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={handleManualRefresh}
              className="text-xs font-bold text-brand-700 hover:text-brand-800 underline focus-visible:outline-none"
            >
              Refresh Karein
            </button>
            <button
              onClick={() => setNewOrdersToast(null)}
              className="text-brand-500 hover:text-brand-700 focus-visible:outline-none"
              aria-label="Dismiss banner"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ROW C: SECONDARY ACTION BAR or BULK ACTION BAR */}
      {selectedOrderIds.size > 0 ? (
        <BulkActionBar
          selectedCount={selectedOrderIds.size}
          selectedIds={Array.from(selectedOrderIds)}
          onDeselectAll={() => setSelectedOrderIds(new Set())}
          onSuccess={handleManualRefresh}
          onOpenShipping={() => setIsBulkShipModalOpen(true)}
          orders={orders}
        />
      ) : (
        <div className="flex justify-between items-center gap-4 w-full">
          <div className="hidden sm:flex items-center gap-3">
            {/* Search */}
            <div className="relative w-[300px]">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                size={16}
              />
              <input
                type="text"
                placeholder="Order # ya buyer naam..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm bg-surface-default border border-border-default rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder:text-text-muted"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Saved Views Dropdown */}
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-md border border-border-default transition-colors">
              <ListFilter size={16} />
              Saved Views
              <ChevronDown size={14} />
            </button>
          </div>

          {/* Mobile Filter & Sort Chips */}
          <div className="flex sm:hidden items-center gap-2 w-full">
            <button
              onClick={() => setIsFilterDrawerOpen(true)}
              className="flex-1 flex justify-center items-center gap-2 px-3 h-8 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-md border border-border-default transition-colors focus-visible:outline-none"
            >
              <SlidersHorizontal size={14} />
              Filter
            </button>
            <button
              onClick={() => handleSort(sortParam)}
              className="flex-1 flex justify-center items-center gap-2 px-3 h-8 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-md border border-border-default transition-colors focus-visible:outline-none"
            >
              <span className="flex items-center justify-center -space-y-1 flex-col h-full mt-1">
                <ChevronDown
                  size={10}
                  className={`rotate-180 ${sortDir === "asc" ? "text-text-primary font-bold" : ""}`}
                />
                <ChevronDown
                  size={10}
                  className={`${sortDir === "desc" ? "text-text-primary font-bold" : ""}`}
                />
              </span>
              Sort
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-3 justify-end">
            <button
              onClick={() => setIsFilterDrawerOpen(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-md border border-border-default transition-colors"
            >
              <SlidersHorizontal size={16} />
              Filter
            </button>
            <ColumnCustomizer 
              columns={ORDER_COLUMNS}
              visibleColumnIds={columnCust.visibleColumnIds}
              onToggle={columnCust.toggleColumn}
              onReset={columnCust.resetColumns}
            />
            <div className="flex items-center gap-2 border-l border-border-default pl-3">
              <button
                onClick={() => setIsAutoRefreshOn(!isAutoRefreshOn)}
                className={`flex items-center gap-2 text-xs font-medium px-2 py-1 rounded transition-colors ${
                  isAutoRefreshOn
                    ? "text-brand-600 bg-brand-50"
                    : "text-text-muted hover:bg-surface-hover"
                }`}
              >
                <RotateCw
                  size={12}
                  className={isAutoRefreshOn ? "animate-spin-slow" : ""}
                />
                Auto-refresh {isAutoRefreshOn ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ERROR STATE */}
      {error && !isLoading && (
        <ErrorBanner
          message="Orders load nahi ho paye. Dobara try karein."
          onRetry={() => fetchOrders(false)}
        />
      )}

      {/* ROW D: DATA TABLE / MOBILE LIST */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Desktop View */}
        <div className="hidden md:flex flex-col h-full overflow-hidden">
          <OrdersTable
            orders={orders}
            isLoading={isLoading}
            sortParam={sortParam}
            sortDir={sortDir}
            onSort={handleSort}
            selectedIds={selectedOrderIds}
            onSelect={(id, selected) => {
              const newSet = new Set(selectedOrderIds);
              if (selected) newSet.add(id);
              else newSet.delete(id);
              setSelectedOrderIds(newSet);
            }}
            onSelectAll={(selected) => {
              if (selected) {
                setSelectedOrderIds(new Set(orders.map((o) => o.id)));
              } else {
                setSelectedOrderIds(new Set());
              }
            }}
            onActionSuccess={() => fetchOrders(false)}
            onClearFilters={handleClearFilters}
            visibleColumnIds={columnCust.visibleColumnIds}
          />
        </div>

        {/* Mobile View */}
        <div className="flex md:hidden flex-col h-full overflow-visible">
          <PullToRefresh onRefresh={async () => { await fetchOrders(true); }}>
            <OrdersMobileList
              orders={orders}
              isLoading={isLoading}
              actionLoadingId={actionLoadingId}
              onActionClick={async (id, action) => {
                if (action === "SHIP") {
                  setSelectedOrderIds(new Set([id]));
                  setIsBulkShipModalOpen(true);
                  return;
                }
                if (action === "CONFIRM" && accessToken) {
                  setActionLoadingId(id);
                  try {
                    const { confirmOrder } = await import('../../../lib/api/orders.client');
                    const res = await confirmOrder(id, accessToken);
                    if (res.success) handleManualRefresh();
                  } finally {
                    setActionLoadingId(null);
                  }
                }
              }}
            />
          </PullToRefresh>
        </div>
      </div>

      {/* ROW E: LOAD MORE */}
      {!isLoading && nextCursor && (
        <div className="flex justify-center mt-4 mb-8">
          <button
            onClick={() => fetchOrders(true)}
            disabled={isLoadingMore}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-md transition-colors disabled:opacity-50"
            aria-label="Aur orders load karein"
            aria-busy={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <RotateCw size={16} className="animate-spin" />
                Loading...
              </>
            ) : (
              `Aur 20 orders load karein`
            )}
          </button>
        </div>
      )}

      {!isLoading && !nextCursor && orders.length > 0 && (
        <div className="text-center text-xs text-text-secondary mt-4 mb-8">
          Sab {orders.length} orders dekh liye
        </div>
      )}

      {/* MODALS & DRAWERS */}
      {isBulkShipModalOpen && (
        <BulkShippingModal
          isOpen={isBulkShipModalOpen}
          onClose={() => setIsBulkShipModalOpen(false)}
          selectedIds={Array.from(selectedOrderIds)}
          orders={orders}
          onSuccess={() => {
            setSelectedOrderIds(new Set());
            handleManualRefresh();
          }}
        />
      )}

      {isFilterDrawerOpen && (
      <FilterDrawer
          isOpen={isFilterDrawerOpen}
          onClose={() => setIsFilterDrawerOpen(false)}
          activeFilters={activeOrderFilters}
          onApply={(filters) => {
            setActiveOrderFilters(filters);
            // Reset to ALL status tab when drawer filters are applied
            // so the tab badge count doesn't conflict
            if (filters.statuses.length > 0) setStatusFilter('ALL');
          }}
          onClear={() => {
            setActiveOrderFilters(EMPTY_ORDER_FILTER);
          }}
        />
      )}

      {/* Mobile Search Overlay */}
      <MobileOrderSearchOverlay
        isOpen={isMobileSearchOpen}
        onClose={() => setIsMobileSearchOpen(false)}
      />
    </div>
  );
}
