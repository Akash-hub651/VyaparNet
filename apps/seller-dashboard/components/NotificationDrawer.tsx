"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../app/contexts/auth.context";
import {
  getSellerNotifications,
  markAllNotificationsRead,
  NotificationViewModel,
} from "../lib/api/notifications.client";
import { NotificationItem } from "./NotificationItem";
import { SkeletonCard } from "./ui/Skeleton";
import { useToast, createToastHelpers } from "./ui/Toast";

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationDrawer({
  isOpen,
  onClose,
}: NotificationDrawerProps) {
  const { accessToken } = useAuth();
  const { addToast } = useToast();
  const toast = createToastHelpers(addToast);

  const [notifications, setNotifications] = useState<NotificationViewModel[]>(
    [],
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Focus trap and escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    // Lock body scroll
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  // Load data
  useEffect(() => {
    if (!isOpen || !accessToken) return;

    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      const res = await getSellerNotifications(accessToken, "Sab");
      if (isMounted) {
        if (res.error) {
          setError(res.error.message);
        } else if (res.data) {
          setNotifications(res.data.data);
          setUnreadCount(res.data.unreadCount || 0);
        }
        setIsLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [isOpen, accessToken]);

  const handleMarkAllRead = async () => {
    if (!accessToken || unreadCount === 0) return;
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllNotificationsRead(accessToken);
    toast.success("Sabhi notifications padh liye gaye");
  };

  const handleReadLocally = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.id === id && !n.isRead) {
          setUnreadCount((c) => Math.max(0, c - 1));
          return { ...n, isRead: true };
        }
        return n;
      }),
    );
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-neutral-900/50 z-[60] transition-opacity animate-in fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 w-full sm:w-[400px] bg-surface-base z-[60] shadow-3 flex flex-col animate-slide-in-right focus:outline-none"
        role="dialog"
        aria-modal="true"
        aria-label="Notification Drawer"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-default bg-surface-card flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-text-primary">
              Notifications
            </h2>
            {unreadCount > 0 && (
              <span className="bg-error-100 text-error-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                {unreadCount} unread
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors p-1"
                aria-label="Saari notifications padhi hui mark karein"
              >
                ✓ Sab Padh Liya
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded-lg transition-colors"
              aria-label="Close notifications"
            >
              <svg
                width="20"
                height="20"
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
            </button>
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto" aria-live="polite">
          {isLoading ? (
            <div className="p-4 space-y-4">
              <SkeletonCard className="h-16 w-full" />
              <SkeletonCard className="h-16 w-full" />
              <SkeletonCard className="h-16 w-full" />
              <SkeletonCard className="h-16 w-full" />
            </div>
          ) : error ? (
            <div className="p-6 text-center text-error-700">
              <p className="text-sm">{error}</p>
              <button
                onClick={() => {
                  /* retry logic */
                }}
                className="mt-2 text-xs font-medium underline"
              >
                Retry
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-10 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-neutral-400"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-text-primary">
                Koi notification nahi
              </h3>
              <p className="text-sm text-text-secondary mt-1">
                Orders, products, aur account updates yahan aayenge.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border-default">
              {notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  isDrawerItem={true}
                  onReadLocally={handleReadLocally}
                  onCloseDrawer={onClose}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-default bg-surface-card flex-shrink-0">
          <Link
            href="/notifications"
            onClick={onClose}
            className="w-full flex justify-center items-center py-2 text-sm font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-md transition-colors"
          >
            Sab Notifications Dekho →
          </Link>
        </div>
      </div>
    </>
  );
}
