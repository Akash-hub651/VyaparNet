"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DayPicker, DateRange } from "react-day-picker";
import { format, startOfWeek, startOfMonth, subMonths } from "date-fns";
import "react-day-picker/dist/style.css"; // Add default styles

const PRESET_OPTIONS = [
  { id: "today", label: "Aaj" },
  { id: "this-week", label: "Is Hafte" },
  { id: "this-month", label: "Is Mahine" },
  { id: "last-3-months", label: "Pichhle 3 Mahine" },
  { id: "custom", label: "Custom Range" },
];

export function DateRangeSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize from URL
  const initialPeriod = searchParams?.get("period") || "this-week";
  const initialFrom = searchParams?.get("from");
  const initialTo = searchParams?.get("to");

  const [activePreset, setActivePreset] = useState(
    PRESET_OPTIONS.find((p) => p.id === initialPeriod)
      ? initialPeriod
      : "custom",
  );
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (initialFrom && initialTo) {
      return { from: new Date(initialFrom), to: new Date(initialTo) };
    }
    return undefined;
  });

  // Handle clicking outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleApplyPreset = (presetId: string) => {
    setActivePreset(presetId);
    if (presetId === "custom") return; // Stay open to show calendar

    const today = new Date();
    let fromDate: Date = today;
    const toDate: Date = today;

    switch (presetId) {
      case "today":
        break;
      case "this-week":
        fromDate = startOfWeek(today, { weekStartsOn: 1 });
        break;
      case "this-month":
        fromDate = startOfMonth(today);
        break;
      case "last-3-months":
        fromDate = subMonths(today, 3);
        break;
    }

    const fromStr = format(fromDate, "yyyy-MM-dd");
    const toStr = format(toDate, "yyyy-MM-dd");

    setIsOpen(false);
    router.push(`/analytics?period=${presetId}&from=${fromStr}&to=${toStr}`);
  };

  const handleApplyCustom = () => {
    if (dateRange?.from && dateRange?.to) {
      const fromStr = format(dateRange.from, "yyyy-MM-dd");
      const toStr = format(dateRange.to, "yyyy-MM-dd");
      setIsOpen(false);
      router.push(`/analytics?period=custom&from=${fromStr}&to=${toStr}`);
    }
  };

  const getButtonLabel = () => {
    if (activePreset !== "custom") {
      const option = PRESET_OPTIONS.find((p) => p.id === activePreset);
      return option ? option.label : "Select Range";
    }
    if (dateRange?.from && dateRange?.to) {
      return `${format(dateRange.from, "d MMM")} – ${format(dateRange.to, "d MMM")}`;
    }
    return "Custom Range";
  };

  const maxDate = new Date();

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-label="Analytics date range select karein"
        className="flex items-center gap-2 h-9 px-3 rounded-md border border-brand-600 text-brand-600 bg-white hover:bg-brand-50 transition-colors text-sm font-medium"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {getButtonLabel()}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full mt-1 z-50 bg-surface-card border border-border-default rounded-lg shadow-2 flex flex-col md:flex-row overflow-hidden"
          role="listbox"
        >
          {/* Presets List */}
          <div className="w-48 flex flex-col py-2 border-r border-border-default border-b md:border-b-0">
            {PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                role="option"
                aria-selected={activePreset === opt.id}
                onClick={() => handleApplyPreset(opt.id)}
                className={`flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-surface-hover transition-colors ${
                  activePreset === opt.id
                    ? "font-semibold text-brand-600"
                    : "text-text-primary"
                }`}
              >
                <span>📅 {opt.label}</span>
                {activePreset === opt.id && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-brand-600"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>

          {/* Custom Date Picker (Only visible if 'custom' is active preset) */}
          {activePreset === "custom" && (
            <div className="p-4 bg-white flex flex-col items-end">
              {/* Note: React Day Picker v9 handles styling differently, we provide basic styling here to match the spec */}
              <style jsx global>{`
                .rdp-root {
                  --rdp-accent-color: #2563eb; /* brand-600 */
                  --rdp-background-color: #eff6ff; /* brand-50 */
                }
              `}</style>
              <DayPicker
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={
                  typeof window !== "undefined" && window.innerWidth >= 768
                    ? 2
                    : 1
                }
                pagedNavigation
                disabled={{ after: maxDate }}
                className="font-sans text-sm"
              />
              <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border-default w-full">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover rounded-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyCustom}
                  disabled={!dateRange?.from || !dateRange?.to}
                  className="px-4 py-1.5 text-sm font-medium bg-brand-600 text-white rounded-md hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
