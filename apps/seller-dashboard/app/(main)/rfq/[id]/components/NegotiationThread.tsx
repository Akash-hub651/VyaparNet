"use client";

import React, { useState } from "react";
import {
  RfqViewModel,
  acceptRfq,
  declineRfq,
} from "../../../../../lib/api/rfq.client";
import { ConfirmDialog } from "../../../../../components/ui/Modal";
import { formatRelativeTime } from "../../../../../lib/formatters";
import {
  useToast,
  createToastHelpers,
} from "../../../../../components/ui/Toast";
import Link from "next/link";
import { MAX_NEGOTIATION_ROUNDS } from "../../../../../lib/config";

interface NegotiationThreadProps {
  rfq: RfqViewModel;
  token: string;
  onActionSuccess: (outcome: "WON" | "LOST" | "QUOTED") => void;
  onOpenCounterForm: () => void;
}

export function NegotiationThread({
  rfq,
  token,
  onActionSuccess,
  onOpenCounterForm,
}: NegotiationThreadProps) {
  const { addToast } = useToast();
  const toast = createToastHelpers(addToast);

  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [showAcceptConfirm, setShowAcceptConfirm] = useState(false);
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [terminalOutcome, setTerminalOutcome] = useState<"WON" | "LOST" | null>(
    null,
  );

  // LOW-MS3 FIX: Use MAX_NEGOTIATION_ROUNDS from lib/config.ts (not hardcoded).
  // Authority: seller_dashboard_architecture.md §12 (ARCH-REV-SD-11 RESOLVED)
  const currentRound = Math.max(
    ...(rfq.negotiations || []).map((n) => n.round),
    1,
  );
  const negotiations = rfq.negotiations || [];

  // Terminal state logic (Round 3 and buyer sent last message)
  const lastEvent = negotiations[negotiations.length - 1];
  const isTerminalState =
    currentRound >= MAX_NEGOTIATION_ROUNDS && lastEvent?.type === "BUYER_COUNTER";

  const handleAccept = async () => {
    setIsAccepting(true);
    setActionError(null);
    const res = await acceptRfq(rfq.id, token);
    setIsAccepting(false);
    setShowAcceptConfirm(false);

    if (res.error) {
      setActionError("Accept nahi ho paya. Dobara try karein.");
    } else {
      setTerminalOutcome("WON");
      toast.success("RFQ accept ho gaya! Order jald aayega. 🎉");
      onActionSuccess("WON");
    }
  };

  const handleDecline = async () => {
    setIsDeclining(true);
    setActionError(null);
    const res = await declineRfq(rfq.id, "price_not_viable", token);
    setIsDeclining(false);
    setShowDeclineConfirm(false);

    if (res.error) {
      setActionError("Decline nahi ho paya. Dobara try karein.");
    } else {
      setTerminalOutcome("LOST");
      toast.success("RFQ decline kar diya gaya.");
      onActionSuccess("LOST");
    }
  };

  const [now] = useState(() => Date.now());
  const isActionable =
    rfq.status === "QUOTED" && new Date(rfq.expiresAt).getTime() > now;

  return (
    <div className="space-y-6 mt-8">
      <h3 className="text-lg font-semibold text-text-primary">
        Negotiation Thread
      </h3>

      <div className="space-y-4 flex flex-col">
        {negotiations.length === 0 && (
          <p className="text-sm text-text-secondary italic">
            Koi negotiation history nahi hai.
          </p>
        )}

        {negotiations.map((event) => {
          const isSeller = event.type.startsWith("SELLER_");

          return (
            <div
              key={event.id}
              className={`flex flex-col ${isSeller ? "items-end" : "items-start"}`}
            >
              <span className="text-[10px] text-text-muted uppercase tracking-wider mb-1">
                Round {event.round}
              </span>

              <div
                className={`max-w-[85%] rounded-lg p-3 ${
                  isSeller
                    ? "bg-brand-100 text-brand-900 rounded-tr-none"
                    : "bg-neutral-100 text-neutral-900 rounded-tl-none"
                }`}
              >
                <p className="text-sm">
                  {event.message
                    ? event.message
                    : event.type.includes("QUOTE") ||
                        event.type.includes("COUNTER")
                      ? `₹${event.price?.toLocaleString("en-IN")}/${rfq.unit} · ${event.minQuantity} min qty · ${event.deliveryDays} din delivery`
                      : event.type.includes("ACCEPT")
                        ? "Offer accepted."
                        : "Offer declined."}
                </p>
              </div>

              <span className="text-xs text-text-secondary mt-1">
                {isSeller ? "Aapka quote" : "Buyer ka response"} ·{" "}
                {formatRelativeTime(event.createdAt)}
              </span>
            </div>
          );
        })}
      </div>

      {/* LOW-A6 FIX: aria-live region announces action outcomes to screen readers */}
      <div aria-live="polite" aria-atomic="true">
        {actionError && (
          <div
            role="alert"
            className="bg-error-50 text-error-700 p-3 rounded text-sm border border-error-200"
          >
            {actionError}
          </div>
        )}
      </div>

      {isActionable &&
        !isTerminalState &&
        lastEvent?.type === "BUYER_COUNTER" && (
          <div className="flex flex-col items-end mt-4">
            <p className="text-xs text-text-secondary mb-2">
              Aap counter quote bhej sakte hain
            </p>
            <button
              onClick={onOpenCounterForm}
              className="px-4 py-2 bg-surface-base border border-brand-500 text-brand-600 rounded-md text-sm font-medium hover:bg-brand-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 min-h-[44px]"
            >
              + Counter Quote Karein
            </button>
          </div>
        )}

      {isActionable && isTerminalState && (
        <div className="mt-8">
          {terminalOutcome === "WON" ? (
            <div className="bg-success-50 border-2 border-success-500 rounded-lg p-5 shadow-1 flex flex-col items-center text-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-success-500 mb-3"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h4 className="text-lg font-bold text-success-800">
                Congratulations! RFQ {rfq.rfqId} Win Ho Gaya! 🎉
              </h4>
              <p className="text-sm text-success-700 mt-1">
                Order aane ka wait karein — buyer jald order karega.
              </p>
              <Link
                href="/orders"
                className="mt-4 text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                Sab Orders Dekho →
              </Link>
            </div>
          ) : terminalOutcome === "LOST" ? (
            <div className="bg-neutral-50 border-2 border-neutral-300 rounded-lg p-5 shadow-1 flex flex-col items-center text-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-neutral-400 mb-3"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <h4 className="text-lg font-bold text-neutral-800">
                RFQ Decline Kar Diya
              </h4>
              <p className="text-sm text-neutral-600 mt-1">
                Ye RFQ close ho gaya. Agle RFQs pe dhyan dein.
              </p>
              <Link
                href="/rfq"
                className="mt-4 text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                RFQ List Dekho →
              </Link>
            </div>
          ) : (
            <div className="bg-surface-card border-2 border-brand-200 rounded-lg p-4 shadow-1">
              <h4 className="text-sm font-semibold text-text-primary">
                ⚡ Final Decision Time
              </h4>
              <p className="text-xs text-text-secondary mt-1">
                Round 3 complete. Ab sirf Accept ya Decline kar sakte hain
              </p>

              <div className="bg-info-50 text-info-700 text-sm p-3 rounded mt-3 border border-info-100">
                Buyer ka last offer: ₹
                {lastEvent?.price?.toLocaleString("en-IN") || 0}/{rfq.unit} ·{" "}
                {lastEvent?.deliveryDays || 0} din delivery
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowAcceptConfirm(true)}
                  disabled={isAccepting || isDeclining}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-2 bg-success-600 text-white rounded-md text-sm font-medium hover:bg-success-700 disabled:opacity-50 transition-colors"
                >
                  {isAccepting ? "Loading..." : "✓ Accept Karein"}
                </button>
                <button
                  onClick={() => setShowDeclineConfirm(true)}
                  disabled={isAccepting || isDeclining}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-2 bg-error-600 text-white rounded-md text-sm font-medium hover:bg-error-700 disabled:opacity-50 transition-colors"
                >
                  {isDeclining ? "Loading..." : "× Decline Karein"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Accept Confirm Dialog */}
      <ConfirmDialog
        isOpen={showAcceptConfirm}
        onClose={() => setShowAcceptConfirm(false)}
        onConfirm={handleAccept}
        title="RFQ accept karna chahte hain?"
        description={`Buyer ka offer ₹${lastEvent?.price?.toLocaleString("en-IN") || 0}/${rfq.unit} accept hoga. Jald order aayega.`}
        confirmLabel="Haan, Accept Karein"
        cancelLabel="Nahi, Wapas Jaiye"
      />

      {/* Decline Confirm Dialog */}
      <ConfirmDialog
        isOpen={showDeclineConfirm}
        onClose={() => setShowDeclineConfirm(false)}
        onConfirm={handleDecline}
        title="RFQ decline karna chahte hain?"
        description="Ye RFQ permanently close ho jayega. Isko undo nahi kar sakte."
        confirmLabel="Haan, Decline Karein"
        cancelLabel="Nahi, Wapas Jaiye"
        confirmVariant="destructive"
        warning="Ye action reverse nahi ho sakta"
      />
    </div>
  );
}
