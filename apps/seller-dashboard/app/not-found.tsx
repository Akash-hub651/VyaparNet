"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "../components/ui/Button";

function SearchXIcon({ className }: { className?: string }) {
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
      <path d="m13.5 8.5-5 5" />
      <path d="m8.5 8.5 5 5" />
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function NotFoundPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-surface-app flex flex-col">
      {/* Minimal Standard Header */}
      <header className="h-16 bg-surface-card border-b border-border-default flex items-center px-6 shrink-0">
        <button
          onClick={() => router.push("/dashboard")}
          className="text-xl font-bold text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          VyaparNet
        </button>
      </header>

      {/* 404 Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-[fadeIn_300ms_ease-out]">
        <div className="text-text-muted mb-6">
          <SearchXIcon />
        </div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Ye page nahi mila
        </h1>
        <p className="text-base text-text-secondary mb-8 max-w-md mx-auto">
          Aap kisi aisi jagah aa gaye jo exist nahi karti, ya link galat hai.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Button onClick={() => router.push("/dashboard")} variant="primary">
            ← Dashboard Pe Jaiye
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.history.back();
              }
            }}
          >
            ← Pichhe Jaiye
          </Button>
        </div>
      </main>
    </div>
  );
}
