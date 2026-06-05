"use client";

import React, { useState, useEffect, useRef } from "react";

// --- Types ---
export interface FAQItemData {
  id: string;
  question: string;
  answer: string | React.ReactNode;
}

export interface FAQSectionData {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: FAQItemData[];
}

// --- Icons ---
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function HelpCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

// --- Internal Components ---

function FAQItem({ item }: { item: FAQItemData }) {
  const [isOpen, setIsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div className="border-b border-border-default last:border-b-0 bg-surface-app">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={`faq-answer-${item.id}`}
        className="w-full flex items-start text-left px-6 py-4 focus-visible:outline-none focus-visible:bg-surface-hover"
      >
        <div className="shrink-0 mt-0.5 text-brand-600 mr-3">
          <HelpCircleIcon />
        </div>
        <div className="flex-1">
          <span className="text-sm font-semibold text-text-primary block pr-4">
            {item.question}
          </span>
          <div
            id={`faq-answer-${item.id}`}
            role="region"
            ref={contentRef}
            className="transition-all duration-200 ease-in-out overflow-hidden"
            style={{
              maxHeight: isOpen ? "500px" : "0px",
              opacity: isOpen ? 1 : 0,
            }}
            aria-hidden={!isOpen}
          >
            <div className="pt-2">
              <div className="bg-brand-50 rounded-lg p-3 text-sm text-text-secondary leading-relaxed">
                {item.answer}
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0 mt-0.5 text-text-muted">
          {isOpen ? <XIcon /> : <PlusIcon />}
        </div>
      </button>
    </div>
  );
}

function FAQSection({
  section,
  isOpen,
  onToggle,
}: {
  section: FAQSectionData;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll to section if it was just opened
  useEffect(() => {
    if (isOpen && headerRef.current) {
      // Small timeout to allow max-height transition to start
      setTimeout(() => {
        headerRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        headerRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  return (
    <div
      id={`faq-section-${section.id}`}
      className="border border-border-default rounded-xl overflow-hidden mb-4 bg-surface-card shadow-1"
    >
      <h2 className="m-0">
        <button
          ref={headerRef}
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`faq-section-body-${section.id}`}
          className="w-full h-[52px] flex items-center justify-between px-6 bg-surface-card hover:bg-surface-hover transition-colors border-b border-border-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 inset-ring-0"
        >
          <div className="flex items-center gap-3">
            <span className="text-text-secondary shrink-0 flex items-center justify-center w-[18px] h-[18px]">
              {section.icon}
            </span>
            <span className="text-sm font-semibold text-text-primary">
              {section.title}
            </span>
            <span className="text-xs text-text-muted ml-2 bg-surface-hover px-2 py-0.5 rounded-full">
              {section.items.length}{" "}
              {section.items.length === 1 ? "item" : "items"}
            </span>
          </div>
          <ChevronDownIcon
            className={`text-text-muted transition-transform duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </h2>
      <div
        id={`faq-section-body-${section.id}`}
        role="region"
        ref={contentRef}
        className="transition-all duration-300 ease-in-out overflow-hidden bg-surface-app"
        style={{
          maxHeight: isOpen ? "2000px" : "0px",
        }}
        aria-hidden={!isOpen}
      >
        <div>
          {section.items.map((item) => (
            <FAQItem key={item.id} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Main Component ---
export function FAQAccordion({
  sections,
  targetSectionId,
}: {
  sections: FAQSectionData[];
  targetSectionId?: string | null;
}) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  // When targetSectionId changes (e.g. via QuickHelpCard click), open it
  useEffect(() => {
    if (targetSectionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenSections((prev) => ({
        ...prev,
        [targetSectionId]: true,
      }));
    }
  }, [targetSectionId]);

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div className="w-full">
      {sections.map((section) => (
        <FAQSection
          key={section.id}
          section={section}
          isOpen={!!openSections[section.id]}
          onToggle={() => toggleSection(section.id)}
        />
      ))}
    </div>
  );
}
