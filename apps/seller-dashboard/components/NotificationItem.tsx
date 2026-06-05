"use client";

import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  NotificationViewModel,
  markNotificationRead,
} from "../lib/api/notifications.client";
import { useAuth } from "../app/contexts/auth.context";

interface NotificationItemProps {
  notification: NotificationViewModel;
  isDrawerItem?: boolean;
  onReadLocally?: (id: string) => void;
  onCloseDrawer?: () => void;
}

export function NotificationItem({
  notification,
  isDrawerItem,
  onReadLocally,
  onCloseDrawer,
}: NotificationItemProps) {
  const router = useRouter();
  const { accessToken } = useAuth();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementRef = useRef<HTMLDivElement>(null);

  const { id, type, priority, title, body, isRead, actionUrl, createdAt } =
    notification;

  // Auto-mark-read for Drawer (excludes CRITICAL)
  useEffect(() => {
    if (!isDrawerItem || isRead || priority === "CRITICAL" || !accessToken)
      return;

    let timeoutId: ReturnType<typeof setTimeout>;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          timeoutId = setTimeout(() => {
            // Mark as read after 5s in viewport
            markNotificationRead(id, accessToken).then(() => {
              onReadLocally?.(id);
            });
          }, 5000);
        } else {
          clearTimeout(timeoutId);
        }
      },
      { threshold: 0.8 }, // 80% visible
    );

    if (elementRef.current) {
      observerRef.current.observe(elementRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [isDrawerItem, isRead, priority, id, accessToken, onReadLocally]);

  const handleClick = async () => {
    if (!isRead && accessToken) {
      markNotificationRead(id, accessToken); // Fire and forget
      onReadLocally?.(id);
    }
    if (actionUrl) {
      if (onCloseDrawer) onCloseDrawer();
      router.push(actionUrl);
    }
  };

  const getPriorityClasses = () => {
    switch (priority) {
      case "CRITICAL":
        return "border-l-4 border-l-error-500 bg-error-50";
      case "IMPORTANT":
        return `border-l-4 ${isRead ? "border-l-transparent bg-surface-card" : "border-l-brand-500 bg-info-50"}`;
      case "INFO":
      default:
        return `border-l-4 border-l-transparent ${isRead ? "bg-surface-card" : "bg-info-50"}`;
    }
  };

  const getIcon = () => {
    switch (type) {
      case "NEW_ORDER":
        return (
          <svg
            className="w-5 h-5 text-brand-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        );
      case "ORDER_CONFIRMED":
        return (
          <svg
            className="w-5 h-5 text-success-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      case "RETURN_INITIATED":
        return (
          <svg
            className="w-5 h-5 text-warning-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        );
      case "DISPUTE_OPEN":
        return (
          <svg
            className="w-5 h-5 text-error-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
            />
          </svg>
        );
      case "QUOTE_ACCEPTED":
        return (
          <svg
            className="w-5 h-5 text-success-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        );
      case "LOW_STOCK":
        return (
          <svg
            className="w-5 h-5 text-warning-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        );
      case "KYC_APPROVED":
        return (
          <svg
            className="w-5 h-5 text-success-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        );
      case "KYC_REJECTED":
      case "PRODUCT_REJECTED":
        return (
          <svg
            className="w-5 h-5 text-error-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      case "PRODUCT_APPROVED":
        return (
          <svg
            className="w-5 h-5 text-success-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        );
      case "PAYOUT_INITIATED":
        return (
          <svg
            className="w-5 h-5 text-brand-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
          </svg>
        );
      case "SYSTEM_UPDATE":
      default:
        return (
          <svg
            className="w-5 h-5 text-info-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
    }
  };

  const formatRelativeTime = (isoDate: string) => {
    // simplified version for display
    const date = new Date(isoDate);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds} sec pehle`;
    if (diffInSeconds < 3600)
      return `${Math.floor(diffInSeconds / 60)} min pehle`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)} hr pehle`;
    return `${Math.floor(diffInSeconds / 86400)} din pehle`;
  };

  return (
    <div
      ref={elementRef}
      role="article"
      className={`min-h-[64px] flex items-start gap-3 p-4 transition-colors group cursor-pointer hover:bg-surface-hover ${getPriorityClasses()} ${isRead ? "font-normal" : "font-medium"}`}
      onClick={handleClick}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleClick();
      }}
    >
      <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-primary leading-snug">
          {title}
        </p>
        <p
          className={`text-sm mt-1 leading-snug ${isRead ? "text-text-muted" : "text-text-secondary"}`}
        >
          {body}
        </p>
      </div>

      <div className="flex-shrink-0 flex flex-col items-end gap-2">
        <span className="text-xs text-text-muted whitespace-nowrap">
          {formatRelativeTime(createdAt)}
        </span>
        {!isRead && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              markNotificationRead(id, accessToken || "");
              onReadLocally?.(id);
            }}
            className="text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 p-1"
            aria-label="Dismiss notification"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
