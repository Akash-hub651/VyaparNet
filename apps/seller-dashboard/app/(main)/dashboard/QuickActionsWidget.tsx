"use client";

import React from "react";
import Link from "next/link";
import { Plus, RefreshCw, ShoppingCart } from "lucide-react";
import { useAuth } from "../../contexts/auth.context";

export function QuickActionsWidget(): React.JSX.Element {
  const { user } = useAuth();

  // In a full implementation, role is typed. Fallback to general logic.
  const isStaff =
    user && (user as unknown as Record<string, unknown>).role === "STAFF";

  return (
    <div className="flex flex-col sm:flex-row gap-3 mt-6">
      {!isStaff && (
        <Link
          href="/products/new"
          className="flex-1 min-h-[52px] flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <Plus size={16} />
          <span>Add Product</span>
        </Link>
      )}

      <Link
        href="/inventory"
        className="flex-1 min-h-[52px] flex items-center justify-center gap-2 px-4 py-2 border-2 border-brand-600 text-brand-600 rounded-lg font-medium hover:bg-brand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        <RefreshCw size={16} />
        <span>Update Stock</span>
      </Link>

      {!isStaff && (
        <Link
          href="/orders?tab=pending"
          className="flex-1 min-h-[52px] flex items-center justify-center gap-2 px-4 py-2 border-2 border-brand-600 text-brand-600 rounded-lg font-medium hover:bg-brand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
        >
          <ShoppingCart size={16} />
          <span>Pending Orders Dekho</span>
        </Link>
      )}
    </div>
  );
}
