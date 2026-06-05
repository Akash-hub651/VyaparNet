"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "./Button";

function BanIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </svg>
  );
}

export function SuspendedScreen() {
  const router = useRouter();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-[fadeIn_300ms_ease-out]">
      <div className="w-full max-w-lg bg-surface-card border border-border-default rounded-2xl p-8 shadow-2 flex flex-col items-center">
        <div className="text-error-500 mb-6">
          <BanIcon />
        </div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Aapka account suspend ho gaya
        </h1>
        <p className="text-base text-text-secondary mb-8">
          Ye zyada serious issue ke karan hua. Karan jaanein aur resolve karein.
        </p>
        <div className="flex flex-col items-center gap-4 w-full">
          <Button
            onClick={() => router.push("/support")}
            className="w-full bg-error-600 hover:bg-error-700 text-white border-transparent"
          >
            Support Se Sampark Karein
          </Button>
          <p className="text-sm text-text-secondary">
            Email:{" "}
            <a
              href="mailto:support@vyaparnet.com"
              className="text-brand-600 hover:underline"
            >
              support@vyaparnet.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
