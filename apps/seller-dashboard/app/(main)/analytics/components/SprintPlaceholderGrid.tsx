import React from "react";

interface SprintPlaceholderCardProps {
  icon: React.ReactNode;
  title: string;
}

export function SprintPlaceholderGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
      <PlaceholderCard
        title="Returns Analytics"
        icon={
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-neutral-300"
          >
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 .49-4.46" />
          </svg>
        }
      />
      <PlaceholderCard
        title="RFQ Win Rate"
        icon={
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-neutral-300"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        }
      />
      <PlaceholderCard
        title="Buyer Segments"
        icon={
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-neutral-300"
          >
            <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
            <path d="M22 12A10 10 0 0 0 12 2v10z" />
          </svg>
        }
      />
      <PlaceholderCard
        title="Payout Summary"
        icon={
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-neutral-300"
          >
            <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
            <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
            <circle cx="18" cy="12" r="2" />
          </svg>
        }
      />
    </div>
  );
}

function PlaceholderCard({ title, icon }: SprintPlaceholderCardProps) {
  return (
    <div
      className="bg-surface-card border border-border-default rounded-lg p-5 h-[120px] flex items-center gap-4 opacity-70 cursor-default"
      role="note"
      aria-label={`${title}: coming in Sprint 9`}
    >
      <div className="shrink-0">{icon}</div>
      <div>
        <h3 className="text-sm font-semibold text-text-secondary">{title}</h3>
        <p className="text-xs text-text-muted mt-0.5">Jald aayega</p>
        <p className="text-[10px] text-text-muted mt-0.5">Sprint 9 mein</p>
      </div>
    </div>
  );
}
