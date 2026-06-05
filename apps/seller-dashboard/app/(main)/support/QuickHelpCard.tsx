"use client";

import React from "react";

interface QuickHelpCardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick: () => void;
}

export function QuickHelpCard({ title, subtitle, icon, onClick }: QuickHelpCardProps) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex w-full items-center gap-4 text-left",
        "bg-surface-card border border-border-default rounded-lg p-4 cursor-pointer",
        "transition-[border-color,background-color] duration-100 ease-in-out",
        "hover:border-brand-500 hover:bg-brand-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
      ].join(" ")}
      aria-label={title}
    >
      <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 bg-brand-100 text-brand-600 rounded-lg">
        {icon}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-semibold text-text-primary truncate">
          {title}
        </span>
        <span className="text-xs text-text-secondary truncate">
          {subtitle}
        </span>
      </div>
    </button>
  );
}
