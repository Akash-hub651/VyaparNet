"use client";

import React, { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";

function ServerCrashIcon({ className }: { className?: string }) {
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
      <path d="M6 18h12" />
      <path d="M6 14h12" />
      <path d="M6 10h12" />
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="m14 10-2-4-2 4" />
      <path d="m10 14 2 4 2-4" />
    </svg>
  );
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [countdown, setCountdown] = useState(30);

  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  useEffect(() => {
    if (countdown <= 0) {
      reset();
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown, reset]);

  return (
    <html lang="hi" className="antialiased">
      <body className="bg-surface-app text-text-primary font-sans">
        <div className="min-h-screen flex flex-col">
          {/* Minimal Standard Header */}
          <header className="h-16 bg-surface-card border-b border-border-default flex items-center px-6 flex-shrink-0">
            <span className="text-xl font-bold text-brand-600">VyaparNet</span>
          </header>

          {/* 500 Content */}
          <main className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-[fadeIn_300ms_ease-out]">
            <div className="text-error-400 mb-6">
              <ServerCrashIcon />
            </div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Server mein kuch gadbad hua
            </h1>
            <p className="text-base text-text-secondary mb-4 max-w-md mx-auto">
              Ye humari problem hai, aapki nahi. 2-3 minute mein dobara try
              karein.
            </p>
            <p className="text-sm font-medium text-warning-600 mb-8 animate-[pulse_2s_ease-in-out_infinite]">
              Auto-retry in {countdown} seconds...
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Button onClick={reset} variant="primary">
                ↻ Dobara Try Karein
              </Button>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
