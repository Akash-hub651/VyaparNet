'use client';

/**
 * Seller Product Edit — apps/seller-dashboard/app/(main)/products/[id]/edit/page.tsx
 *
 * Authority: SPRINT2_IMPLEMENTATION_LOCKED_final_v2.0.md Section 9.5
 *
 * Same 3-step wizard as the create form, pre-filled with existing product data.
 * On submit → PUT /api/v1/products/:id
 */

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../contexts/auth.context';
import { getSellerProducts, updateProduct, type ProductResponse } from '../../../../../lib/api/products.client';

export default function SellerProductEditPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { accessToken } = useAuth();
  const router = useRouter();
  const [product, setProduct] = useState<ProductResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local form state (inline — reusing the same fields as the create form)
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const [mrp, setMrp] = useState('');
  const [moq, setMoq] = useState('1');
  const [unit, setUnit] = useState('piece');
  const [hsnCode, setHsnCode] = useState('');
  const [gstPercent, setGstPercent] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    // Fetch seller's products and find the one by id
    void getSellerProducts({ limit: 100 }, accessToken).then((res) => {
      if (res.data) {
        const found = res.data.data.find((p) => p.id === id);
        if (found) {
          setProduct(found);
          setName(found.name);
          setDescription(found.description ?? '');
          setBasePrice(String(found.basePrice));
          setMrp(found.mrp ? String(found.mrp) : '');
          setMoq(String(found.moq));
          setUnit(found.unit);
          setHsnCode(found.hsnCode ?? '');
          setGstPercent(found.gstPercent !== null && found.gstPercent !== undefined ? String(found.gstPercent) : '');
          setTags(found.tags?.join(', ') ?? '');
        } else {
          setError('Product not found or you do not own it.');
        }
      } else {
        setError(res.error?.message ?? 'Failed to load product.');
      }
      setIsLoading(false);
    });
  }, [accessToken, id]);

  const handleSave = async (): Promise<void> => {
    if (!accessToken || !product) return;
    setIsSaving(true);
    setError(null);

    const res = await updateProduct(
      product.id,
      {
        name: name.trim(),
        description: description.trim() || undefined,
        basePrice: Number(basePrice),
        mrp: mrp ? Number(mrp) : undefined,
        moq: moq ? Number(moq) : 1,
        unit: unit.trim(),
        hsnCode: hsnCode.trim() || undefined,
        gstPercent: gstPercent ? Number(gstPercent) : undefined,
        tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      },
      accessToken,
    );

    setIsSaving(false);

    if (res.error) {
      setError(res.error.message);
      return;
    }

    router.push('/products');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-[#94A3B8]">
        <svg className="animate-spin w-6 h-6 mr-2" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25" />
          <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        Loading product…
      </div>
    );
  }

  if (error && !product) {
    return (
      <div className="py-16 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <p className="text-[#EF4444] text-sm">{error}</p>
        <button
          onClick={() => router.push('/products')}
          className="mt-4 text-sm text-[#2563EB] hover:text-[#1D4ED8] font-medium"
        >
          ← Back to Products
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page heading */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push('/products')}
          className="text-[#64748B] hover:text-[#1E293B] transition-colors"
          aria-label="Back to products"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M13 4L7 10L13 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-[#1E293B]">Edit Product</h1>
      </div>

      {error && (
        <div className="bg-[#FEE2E2] border border-[#FECACA] rounded-lg px-4 py-3 text-sm text-[#991B1B] mb-5" role="alert">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 shadow-sm space-y-5">

        {/* Product name */}
        <div>
          <label htmlFor="edit-name" className="block text-sm font-medium text-[#1E293B] mb-1.5">
            Product Name <span className="text-[#EF4444]">*</span>
          </label>
          <input
            id="edit-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            maxLength={255}
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="edit-description" className="block text-sm font-medium text-[#1E293B] mb-1.5">Description</label>
          <textarea
            id="edit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>

        {/* Pricing grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="edit-baseprice" className="block text-sm font-medium text-[#1E293B] mb-1.5">Base Price (₹) <span className="text-[#EF4444]">*</span></label>
            <input id="edit-baseprice" type="number" min={0} value={basePrice} onChange={(e) => setBasePrice(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
          </div>
          <div>
            <label htmlFor="edit-mrp" className="block text-sm font-medium text-[#1E293B] mb-1.5">MRP (₹)</label>
            <input id="edit-mrp" type="number" min={0} value={mrp} onChange={(e) => setMrp(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
          </div>
          <div>
            <label htmlFor="edit-moq" className="block text-sm font-medium text-[#1E293B] mb-1.5">Min. Order Qty</label>
            <input id="edit-moq" type="number" min={1} value={moq} onChange={(e) => setMoq(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
          </div>
          <div>
            <label htmlFor="edit-unit" className="block text-sm font-medium text-[#1E293B] mb-1.5">Unit <span className="text-[#EF4444]">*</span></label>
            <input id="edit-unit" type="text" value={unit} onChange={(e) => setUnit(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
          </div>
          <div>
            <label htmlFor="edit-hsn" className="block text-sm font-medium text-[#1E293B] mb-1.5">HSN Code</label>
            <input id="edit-hsn" type="text" value={hsnCode} onChange={(e) => setHsnCode(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
          </div>
          <div>
            <label htmlFor="edit-gst" className="block text-sm font-medium text-[#1E293B] mb-1.5">GST %</label>
            <select id="edit-gst" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] bg-white">
              <option value="">Select</option>
              {[0, 5, 12, 18, 28].map((r) => <option key={r} value={r}>{r}%</option>)}
            </select>
          </div>
        </div>

        {/* Tags */}
        <div>
          <label htmlFor="edit-tags" className="block text-sm font-medium text-[#1E293B] mb-1.5">Tags <span className="text-xs text-[#94A3B8]">(comma-separated)</span></label>
          <input id="edit-tags" type="text" value={tags} onChange={(e) => setTags(e.target.value)}
            className="w-full border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]" />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            id="edit-save-btn"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="flex-1 bg-[#2563EB] text-white font-semibold text-sm py-2.5 rounded-lg hover:bg-[#1D4ED8] transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
          <button
            id="edit-cancel-btn"
            onClick={() => router.push('/products')}
            className="px-5 py-2.5 border border-[#E2E8F0] text-sm font-medium text-[#64748B] rounded-lg hover:bg-[#F8FAFC] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
