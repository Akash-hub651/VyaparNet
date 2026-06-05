"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "../../../components/ui/Button";

function LogInIcon({ className }: { className?: string }) {
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
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

export default function SessionExpiredPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-surface-app flex flex-col items-center justify-center p-6 text-center animate-[fadeIn_300ms_ease-out]">
      <div className="w-full max-w-md bg-surface-card border border-border-default rounded-2xl p-8 shadow-2 flex flex-col items-center">
        <div className="text-warning-400 mb-6">
          <LogInIcon />
        </div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Session expire ho gaya
        </h1>
        <p className="text-base text-text-secondary mb-8">
          Security ke liye aapka session expire ho gaya. Dobara login karein.
        </p>
        <Button
          onClick={() => router.push("/login")}
          variant="primary"
          className="w-full"
        >
          Dobara Login Karein
        </Button>
      </div>
    </div>
  );
}
