"use client";

import React, { useState, useRef, useEffect } from "react";
import { Settings2, Lock } from "lucide-react";
import { ColumnDef } from "../hooks/useColumnCustomization";

interface ColumnCustomizerProps {
  columns: ColumnDef[];
  visibleColumnIds: string[];
  onToggle: (id: string) => void;
  onReset: () => void;
}

export function ColumnCustomizer({
  columns,
  visibleColumnIds,
  onToggle,
  onReset,
}: ColumnCustomizerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 h-9 px-3 rounded-lg border text-sm font-medium transition-colors ${
          isOpen
            ? "border-brand-500 bg-brand-50 text-brand-700"
            : "border-border-default bg-surface-card text-text-secondary hover:text-text-primary hover:bg-surface-hover"
        }`}
        aria-label="Customize columns"
        aria-expanded={isOpen}
      >
        <Settings2 size={16} />
        <span className="hidden sm:inline">Columns</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-[220px] bg-surface-card rounded-lg shadow-2 border border-border-default z-50 animate-[fadeIn_150ms_ease-out]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
            <h3 className="text-sm font-semibold text-text-primary">Columns</h3>
            <button
              onClick={onReset}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50 px-2 py-1 rounded transition-colors"
            >
              Reset
            </button>
          </div>
          
          <div className="py-2 max-h-[300px] overflow-y-auto">
            {columns.map((col) => (
              <label
                key={col.id}
                className={`flex items-center justify-between px-4 h-9 cursor-pointer hover:bg-surface-hover transition-colors ${
                  col.isMandatory ? "opacity-60 cursor-not-allowed" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={visibleColumnIds.includes(col.id)}
                    onChange={() => onToggle(col.id)}
                    disabled={col.isMandatory}
                    className="w-4 h-4 rounded border-border-default text-brand-600 focus:ring-brand-500 focus:ring-offset-0 disabled:opacity-50"
                  />
                  <span className="text-sm text-text-primary select-none">
                    {col.label}
                  </span>
                </div>
                {col.isMandatory && (
                  <Lock size={14} className="text-text-muted" aria-label="Mandatory column" />
                )}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
