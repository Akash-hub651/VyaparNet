"use client";

import React, { useEffect } from "react";
import { useHeader } from "../../contexts/header.context";

export default function TeamManagementPlaceholderPage() {
  const { setTitle } = useHeader();

  useEffect(() => {
    setTitle("Team Management");
  }, [setTitle]);

  return (
    <div className="max-w-2xl mx-auto pt-20 flex flex-col items-center justify-center text-center">
      <div className="mb-6 flex justify-center">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          className="text-neutral-400"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      
      <h2 className="text-xl font-bold text-text-primary mb-3">
        Team Management — Sprint 10 mein aayega
      </h2>
      
      <p className="text-sm text-text-secondary max-w-md">
        Apni team ko access dein — orders process karne ke liye Staff, aur
        full access ke liye Manager. Jald aayega.
      </p>
    </div>
  );
}
