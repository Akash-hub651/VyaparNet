"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { OrderPreviewDto, getOrders } from "../../../../lib/api/orders.client";
import { useAuth } from "../../../contexts/auth.context";
import { OrdersMobileList } from "./OrdersMobileList";

interface MobileOrderSearchOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileOrderSearchOverlay({
  isOpen,
  onClose,
}: MobileOrderSearchOverlayProps) {
  const { accessToken } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [results, setResults] = useState<OrderPreviewDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Simple scroll lock for overlay
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery.length >= 2 || searchQuery.length === 0) {
        setDebouncedSearch(searchQuery);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch results when debounced search changes
  useEffect(() => {
    async function fetchResults() {
      if (!debouncedSearch || debouncedSearch.length < 2) {
        setResults([]);
        setHasSearched(false);
        return;
      }

      if (!accessToken) return;

      setIsLoading(true);
      setHasSearched(true);

      const res = await getOrders(
        { search: debouncedSearch, limit: 10 },
        accessToken,
      );

      if (res.success && res.data) {
        setResults(res.data.data);
      }
      setIsLoading(false);
    }

    fetchResults();
  }, [debouncedSearch, accessToken]);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (!isOpen) {
      setSearchQuery("");
      setDebouncedSearch("");
      setResults([]);
      setHasSearched(false);
    }
  }

  // Focus input on mount
  useEffect(() => {
    if (isOpen) {
      // Small timeout to allow animation to complete before focusing
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    },
    [isOpen, onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  // Intercept Android hardware back button (popstate)
  useEffect(() => {
    if (isOpen) {
      // Push a dummy state so the back button has something to pop
      window.history.pushState({ modal: "mobile-search-overlay" }, "");

      const handlePopState = () => {
        onClose();
      };

      window.addEventListener("popstate", handlePopState);
      return () => {
        window.removeEventListener("popstate", handlePopState);
        // Clean up the dummy state if the modal is closed by other means (like X button)
        // Wait, if it's closed by other means, the state is still there.
        // We should pop it if we are unmounting and the state is our modal state.
        if (window.history.state?.modal === "mobile-search-overlay") {
          window.history.back();
        }
      };
    }
    return undefined;
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-60 bg-surface-card flex flex-col animate-slide-up"
      role="dialog"
      aria-modal="true"
      aria-label="Order search"
      ref={containerRef}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between h-14 border-b border-border-default px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            aria-label="Pichhe jaiye"
            className="p-1 -ml-1 text-text-muted hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-md"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="text-lg font-semibold text-text-primary">
            Order search...
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Search band karein"
          className="p-1 -mr-1 text-text-muted hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-md"
        >
          <X size={20} />
        </button>
      </div>

      {/* Input Row */}
      <div className="border-b border-border-default bg-surface-card shrink-0">
        <div className="relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted"
            size={20}
          />
          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            autoFocus
            placeholder="Order number ya buyer naam dhundho..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-14 pl-12 pr-12 bg-transparent border-none focus:outline-none focus:ring-0 text-base text-text-primary placeholder:text-text-muted"
            aria-label="Order number ya buyer naam dhundho"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                inputRef.current?.focus();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary focus-visible:outline-none rounded-md"
              aria-label="Search text clear karein"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Results Area */}
      <div
        className="flex-1 overflow-y-auto p-4 bg-surface-app"
        aria-live="polite"
      >
        {!hasSearched ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-text-secondary opacity-50 py-12">
            <Search size={48} className="mb-4" />
            <p>Koi bhi order easily dhundhein</p>
          </div>
        ) : isLoading ? (
          <OrdersMobileList
            orders={[]}
            isLoading={true}
            onActionClick={() => {}}
            actionLoadingId={null}
          />
        ) : results.length > 0 ? (
          <div className="pb-8">
            <div className="text-xs font-medium text-text-secondary mb-3">
              {results.length} order{results.length !== 1 ? "s" : ""} mile
            </div>
            {/* Action buttons are disabled in search results per spec, so we pass empty handler */}
            <OrdersMobileList
              orders={results}
              isLoading={false}
              onActionClick={() => {}}
              actionLoadingId={null}
            />
          </div>
        ) : (
          <div className="text-center py-12 text-text-secondary">
            <p className="text-base font-medium text-text-primary mb-1">
              Koi order nahi mila
            </p>
            <p className="text-sm">Dusra number ya naam try karein</p>
          </div>
        )}
      </div>
    </div>
  );
}
