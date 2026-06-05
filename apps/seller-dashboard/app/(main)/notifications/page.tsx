"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../../contexts/auth.context";
import {
  getSellerNotifications,
  markAllNotificationsRead,
  NotificationViewModel,
} from "../../../lib/api/notifications.client";
import { NotificationItem } from "../../../components/NotificationItem";
import { SkeletonCard } from "../../../components/ui/Skeleton";
import { useToast, createToastHelpers } from "../../../components/ui/Toast";

const TABS = ["Sab", "Unread", "Orders", "Products", "System"];

export default function NotificationsPage() {
  const { accessToken } = useAuth();
  const { addToast } = useToast();
  const toast = createToastHelpers(addToast);

  const [activeTab, setActiveTab] = useState("Sab");
  const [notifications, setNotifications] = useState<NotificationViewModel[]>(
    [],
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    if (!accessToken) return;

    let isMounted = true;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      const res = await getSellerNotifications(accessToken, activeTab);
      if (isMounted) {
        if (res.error) {
          setError(res.error.message);
        } else if (res.data) {
          setNotifications(res.data.data);
          // Only update global unread count if we are on 'Sab' or if the API returns it reliably
          if (res.data.unreadCount !== undefined) {
            setUnreadCount(res.data.unreadCount);
            // D-05 FIX: Update sidebar notification badge count
            window.dispatchEvent(
              new CustomEvent('kpi-badges-updated', {
                detail: { unreadNotifCount: res.data.unreadCount },
              }),
            );
          }
        }
        setIsLoading(false);
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [accessToken, activeTab]);

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

  // Group notifications by date
  const groupedNotifications = useMemo(() => {
    const groups: Record<string, NotificationViewModel[]> = {
      Aaj: [],
      Kal: [],
      "Is Hafte": [],
      Pehle: [],
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    notifications.forEach((n) => {
      const date = new Date(n.createdAt);
      if (date >= today) {
        groups["Aaj"].push(n);
      } else if (date >= yesterday) {
        groups["Kal"].push(n);
      } else if (date >= thisWeek) {
        groups["Is Hafte"].push(n);
      } else {
        groups["Pehle"].push(n);
      }
    });

    return Object.entries(groups).filter(([, items]) => items.length > 0);
  }, [notifications]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ROW A: PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl md:text-2xl font-bold text-text-primary hidden md:block">
            Notifications
          </h1>
          {unreadCount > 0 && (
            <span
              className="bg-error-100 text-error-700 text-xs font-semibold px-2.5 py-1 rounded-full"
              aria-label={`Unread notifications: ${unreadCount}`}
            >
              {unreadCount} unread
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="flex items-center gap-1.5 px-4 py-2 bg-surface-card border border-border-default hover:bg-surface-hover rounded-lg text-sm font-medium text-brand-600 transition-colors"
            aria-label="Saari notifications padhi hui mark karein"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Sab Padh Liya
          </button>
        )}
      </div>

      {/* ROW B: TAB BAR */}
      <div className="flex overflow-x-auto hide-scrollbar border-b border-border-default">
        <div className="flex gap-6 min-w-max px-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  "pb-3 text-sm font-medium transition-colors border-b-2 relative whitespace-nowrap outline-none",
                  isActive
                    ? "border-brand-500 text-brand-600"
                    : "border-transparent text-text-secondary hover:text-text-primary",
                ].join(" ")}
              >
                {tab}
                {tab === "Unread" && unreadCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-error-500 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ROW C: NOTIFICATION LIST */}
      <div className="bg-surface-card rounded-xl shadow-1 border border-border-default overflow-hidden min-h-[400px]">
        {isLoading ? (
          <div className="divide-y divide-border-default">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 flex gap-4">
                <SkeletonCard className="w-5 h-5 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <SkeletonCard className="h-4 w-1/3" />
                  <SkeletonCard className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-error-700">{error}</p>
            <button
              onClick={() => setActiveTab("Sab")}
              className="mt-4 px-4 py-2 bg-neutral-100 rounded-md text-sm font-medium hover:bg-neutral-200"
            >
              Retry
            </button>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-16 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
              {activeTab === "Unread" ? (
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-success-500"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              ) : (
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-neutral-400"
                >
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              )}
            </div>
            <h3 className="text-lg font-semibold text-text-primary">
              {activeTab === "Unread"
                ? "Sab notifications padh liye!"
                : "Koi notification nahi"}
            </h3>
            <p className="text-sm text-text-secondary mt-1 max-w-sm">
              {activeTab === "Unread"
                ? "Aapke paas koi nayi notification nahi hai."
                : "Orders, products, aur account updates yahan aayenge."}
            </p>
          </div>
        ) : (
          <div>
            {groupedNotifications.map(([group, items]) => (
              <div key={group}>
                <div className="px-4 py-2 bg-surface-base border-y border-border-default first:border-t-0">
                  <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    {group}
                  </h3>
                </div>
                <div className="divide-y divide-border-default">
                  {items.map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      isDrawerItem={false}
                      onReadLocally={handleReadLocally}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ROW D: LOAD MORE */}
      {!isLoading && notifications.length >= 20 && (
        <div className="flex justify-center">
          <button className="px-6 py-2.5 bg-white border border-border-default rounded-md text-sm font-medium hover:bg-surface-hover transition-colors shadow-sm">
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
