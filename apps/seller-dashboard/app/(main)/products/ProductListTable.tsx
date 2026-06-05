import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Edit2,
  MoreVertical,
  Archive,
  Play,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { ProductStatus } from "@vyaparnet/types";
import {
  type ProductResponse,
  archiveProduct,
  publishProduct,
  restoreProduct,
} from "../../../lib/api/products.client";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { useAuth } from "../../contexts/auth.context";
import { useToast } from "../../../components/ui/Toast";
import { formatAmount } from "../../../lib/formatters";

interface ProductListTableProps {
  products: ProductResponse[];
  selectedIds: Set<string>;
  onSelectionChange: (id: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  onRefresh: () => void;
  isStaff: boolean;
  visibleColumnIds?: string[];
}

export function ProductListTable({
  products,
  selectedIds,
  onSelectionChange,
  onSelectAll,
  onRefresh,
  isStaff,
  visibleColumnIds = [
    "product",
    "segment",
    "price",
    "stock",
    "status",
    "actions",
  ],
}: ProductListTableProps): React.JSX.Element {
  const router = useRouter();
  const { accessToken } = useAuth();
  const { addToast } = useToast();

  const allSelected =
    products.length > 0 && selectedIds.size === products.length;
  const indeterminate =
    selectedIds.size > 0 && selectedIds.size < products.length;

  const handleAction = async (
    action: "archive" | "publish" | "restore",
    product: ProductResponse,
  ) => {
    if (!accessToken || isStaff) return;

    if (action === "archive") {
      if (
        !confirm(
          `Ye product archive ho jayega. Buyers isay nahi dekh payenge. Confirm karein?`,
        )
      )
        return;
    }

    try {
      let res;
      if (action === "archive")
        res = await archiveProduct(product.id, accessToken);
      else if (action === "publish")
        res = await publishProduct(product.id, accessToken);
      else if (action === "restore")
        res = await restoreProduct(product.id, accessToken);

      if (res && res.success) {
        addToast({ message: `Product ${action} ho gaya!`, variant: "success" });
        onRefresh();
      } else if (res && !res.success) {
        addToast({ message: res.error, variant: "error" });
      }
    } catch {
      addToast({
        message: "Action fail ho gaya. Dobara try karein.",
        variant: "error",
      });
    }
  };

  const isColVisible = (id: string) => visibleColumnIds.includes(id);

  return (
    <div className="bg-surface-default border border-border-default rounded-xl overflow-hidden shadow-1 relative">
      <div className="overflow-x-auto min-h-[400px]">
        <table className="w-full text-left text-sm" aria-label="Products list">
          <thead className="bg-surface-hover border-b border-border-default text-text-secondary text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = indeterminate;
                  }}
                  onChange={(e) => onSelectAll(e.target.checked)}
                  className="rounded border-border-strong text-brand-600 focus:ring-brand-500 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                  aria-label="Select all products"
                />
              </th>
              {isColVisible("product") && (
                <th className="px-4 py-3 flex-1">Product</th>
              )}
              {isColVisible("segment") && (
                <th className="px-4 py-3 w-28">Segment</th>
              )}
              {isColVisible("price") && (
                <th className="px-4 py-3 w-28 text-right">Price</th>
              )}
              {isColVisible("stock") && (
                <th className="px-4 py-3 w-24 text-right">Stock</th>
              )}
              {isColVisible("status") && (
                <th className="px-4 py-3 w-36">Status</th>
              )}
              {isColVisible("actions") && (
                <th className="px-4 py-3 w-24 text-right">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {products.map((product) => {
              const isSelected = selectedIds.has(product.id);
              const isRejected = product.status === ProductStatus.REJECTED;
              const isArchived = product.status === ProductStatus.ARCHIVED;

              // Fallback image
              const firstImage = product.media?.[0]?.url;
              const initials = product.name.substring(0, 2).toUpperCase();

              return (
                <tr
                  key={product.id}
                  className={`hover:bg-surface-hover transition-colors group ${
                    isSelected ? "bg-brand-50" : ""
                  } ${isArchived ? "opacity-70" : ""}`}
                  style={isRejected ? { borderLeft: "2px solid #EF4444" } : {}}
                >
                  <td className="px-4 py-4 text-center align-top pt-5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) =>
                        onSelectionChange(product.id, e.target.checked)
                      }
                      className="rounded border-border-strong text-brand-600 focus:ring-brand-500 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                      aria-label={`Select ${product.name}`}
                    />
                  </td>

                  {isColVisible("product") && (
                    <td className="px-4 py-4 min-w-[250px]">
                      <div className="flex items-start gap-3">
                        {firstImage ? (
                          <div className="relative w-10 h-10 rounded-md shrink-0 bg-surface-card overflow-hidden">
                            <Image
                              src={firstImage}
                              alt={product.name}
                              fill
                              unoptimized
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-md bg-brand-600 text-white flex items-center justify-center font-semibold text-xs shrink-0">
                            {initials}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-text-primary text-sm line-clamp-2">
                            {product.name}
                          </div>
                          <div className="text-xs text-text-secondary mt-0.5 font-mono">
                            {product.slug}
                          </div>
                        </div>
                      </div>
                    </td>
                  )}

                  {isColVisible("segment") && (
                    <td className="px-4 py-4 align-top pt-5">
                      <span className="px-2 py-0.5 rounded-full bg-surface-card border border-border-strong text-xs font-medium text-text-primary">
                        {product.segment}
                      </span>
                    </td>
                  )}

                  {isColVisible("price") && (
                    <td className="px-4 py-4 text-right align-top pt-5 whitespace-nowrap">
                      <div className="text-sm font-mono text-text-primary">
                        {formatAmount(product.basePrice)}
                      </div>
                      <div className="text-xs text-text-muted mt-0.5">
                        /{product.unit}
                      </div>
                    </td>
                  )}

                  {isColVisible("stock") && (
                    <td className="px-4 py-4 text-right align-top pt-5 whitespace-nowrap">
                      <div
                        className={`text-sm font-mono ${product.moq === 0 ? "text-error-700 font-semibold" : "text-text-primary"}`}
                      >
                        {product.moq} pcs
                      </div>
                      {product.moq === 0 && (
                        <div className="text-[10px] text-error-700 uppercase mt-0.5 font-semibold">
                          Out of stock
                        </div>
                      )}
                    </td>
                  )}

                  {isColVisible("status") && (
                    <td className="px-4 py-4 align-top pt-4">
                      <StatusBadge status={product.status} />
                      {isRejected && product.rejectionReason && (
                        <div
                          className="text-xs text-error-600 mt-1 line-clamp-1 max-w-[140px]"
                          title={product.rejectionReason}
                        >
                          {product.rejectionReason}
                        </div>
                      )}
                    </td>
                  )}

                  {isColVisible("actions") && (
                    <td className="px-4 py-4 align-top pt-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                        {!isStaff && (
                          <button
                            onClick={() =>
                              router.push(`/products/${product.id}/edit`)
                            }
                            className="w-11 h-11 sm:w-8 sm:h-8 flex items-center justify-center rounded text-text-secondary hover:text-brand-600 hover:bg-brand-50 transition-colors"
                            aria-label="Edit product"
                          >
                            <Edit2 size={16} />
                          </button>
                        )}

                        {!isStaff && (
                          <div className="relative group/menu">
                            <button
                              className="w-11 h-11 sm:w-8 sm:h-8 flex items-center justify-center rounded text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
                              aria-label="More actions"
                            >
                              <MoreVertical size={16} />
                            </button>

                            <div className="absolute right-0 top-full mt-1 w-48 bg-surface-default border border-border-default rounded-md shadow-2 opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all z-10 text-left">
                              <div className="py-1">
                                {product.status === ProductStatus.DRAFT && (
                                  <button
                                    onClick={() =>
                                      handleAction("publish", product)
                                    }
                                    className="w-full px-4 py-2 text-sm text-left flex items-center gap-2 hover:bg-surface-hover text-text-primary min-h-[44px]"
                                  >
                                    <Play
                                      size={14}
                                      className="text-brand-600"
                                    />{" "}
                                    Publish
                                  </button>
                                )}

                                {(product.status === ProductStatus.ACTIVE ||
                                  isRejected) && (
                                  <button
                                    onClick={() =>
                                      handleAction("archive", product)
                                    }
                                    className="w-full px-4 py-2 text-sm text-left flex items-center gap-2 hover:bg-surface-hover text-error-600 min-h-[44px]"
                                  >
                                    <Archive size={14} /> Archive
                                  </button>
                                )}

                                {isArchived && (
                                  <button
                                    onClick={() =>
                                      handleAction("restore", product)
                                    }
                                    className="w-full px-4 py-2 text-sm text-left flex items-center gap-2 hover:bg-surface-hover text-text-primary min-h-[44px]"
                                  >
                                    <RefreshCw
                                      size={14}
                                      className="text-brand-600"
                                    />{" "}
                                    Restore
                                  </button>
                                )}

                                {isRejected && (
                                  <button
                                    onClick={() =>
                                      alert(
                                        `Rejection reason: ${product.rejectionReason ?? "N/A"}`,
                                      )
                                    }
                                    className="w-full px-4 py-2 text-sm text-left flex items-center gap-2 hover:bg-surface-hover text-error-700 min-h-[44px] font-medium"
                                  >
                                    <AlertCircle size={14} /> View Rejection
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Staff Fallback Action */}
                        {isStaff && (
                          <button
                            onClick={() =>
                              router.push(`/products/${product.id}/edit`)
                            }
                            className="px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 rounded min-h-[44px]"
                          >
                            View
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
