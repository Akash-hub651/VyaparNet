"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../../../../contexts/auth.context";
import { updateBusinessProfile } from "../../../../../lib/api/settings.client";
import { useToast } from "../../../../../components/ui/Toast";

export function BrandDetailsForm() {
  const { user, accessToken } = useAuth();
  const { addToast } = useToast();

  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    brandName: "",
    brandTagline: "",
  });

  // Minimal state for logo
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safeUser = user as any;
    if (safeUser && (safeUser.business || safeUser.businesses)) {
      const business = safeUser.business || safeUser.businesses?.[0];
      const initialBrandName = business.brandName || "";
      const initialTagline = business.brandTagline || "";

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        brandName: initialBrandName,
        brandTagline: initialTagline,
      });

      if (business.logoUrl) {
        setLogoPreview(business.logoUrl);
      }

      // Auto-expand if data exists
      if (initialBrandName || initialTagline || business.logoUrl) {
        setIsExpanded(true);
      }
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      addToast({
        message: "Logo file size must be less than 2MB",
        variant: "error",
      });
      return;
    }

    // Read file for preview and ratio check
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;

      const img = new window.Image();
      img.onload = () => {
        if (img.width !== img.height) {
          addToast({
            message: "Logo square hona chahiye (1:1 ratio)",
            variant: "error",
          });
          return;
        }
        setLogoPreview(dataUrl);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoPreview(null);
  };

  const handleSave = async () => {
    if (!accessToken) return;

    setIsLoading(true);
    try {
      // In a real app, we'd upload the logo file to S3/CDN first, then get the URL.
      // For Sprint 8, we just patch the text fields.
      const res = await updateBusinessProfile(
        {
          brandName: formData.brandName,
          brandTagline: formData.brandTagline,
          logoUrl: logoPreview || undefined,
        },
        accessToken,
      );

      if (res.success) {
        addToast({
          message: "Brand details update ho gayi!",
          variant: "success",
        });
      } else {
        // Handle Sprint 8 fallback (graceful degradation)
        addToast({
          message:
            res.error || "Profile save nahi ho payi. Backend unavailable.",
          variant: "error",
        });
      }
    } catch {
      addToast({
        message: "Profile save nahi ho payi. Dobara try karein.",
        variant: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border border-border-default rounded-lg bg-surface-card overflow-hidden transition-all duration-300">
      {/* Accordion Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-5 focus:outline-none focus-visible:bg-neutral-50 hover:bg-neutral-50 transition-colors"
      >
        <div className="text-left">
          <h2 className="text-base font-semibold text-text-primary">
            Brand Details
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Logos aur taglines add karein
          </p>
        </div>
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-neutral-400 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Accordion Body */}
      {isExpanded && (
        <div className="p-5 border-t border-border-default space-y-6">
          {/* FIELD: Brand Name */}
          <div>
            <label
              htmlFor="brandName"
              className="block text-sm font-medium text-text-primary mb-1"
            >
              Brand ka naam (optional)
            </label>
            <input
              id="brandName"
              name="brandName"
              type="text"
              placeholder="e.g., Ramesh Premium Textiles"
              value={formData.brandName}
              onChange={handleChange}
              className="w-full h-10 px-3 py-2 text-base md:text-sm border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors bg-surface-base"
            />
            <p className="text-xs text-text-secondary mt-1">
              Agar aapka business ka alag brand naam hai
            </p>
          </div>

          {/* FIELD: Brand Tagline */}
          <div>
            <div className="flex justify-between mb-1">
              <label
                htmlFor="brandTagline"
                className="block text-sm font-medium text-text-primary"
              >
                Brand tagline (optional)
              </label>
              <span className="text-xs text-text-muted">
                {formData.brandTagline.length}/80
              </span>
            </div>
            <input
              id="brandTagline"
              name="brandTagline"
              type="text"
              maxLength={80}
              placeholder="Quality ki guarantee"
              value={formData.brandTagline}
              onChange={handleChange}
              className="w-full h-10 px-3 py-2 text-base md:text-sm border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors bg-surface-base"
            />
          </div>

          {/* FIELD: Business Logo */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Business Logo (optional)
            </label>
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 rounded-full bg-neutral-50 border-2 border-dashed border-border-default flex items-center justify-center overflow-hidden shrink-0 group">
                {logoPreview ? (
                  <>
                    {}
                    <img
                      src={logoPreview}
                      alt="Brand Logo Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={removeLogo}
                      className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove logo"
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </>
                ) : (
                  <span className="text-neutral-400">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="2"
                        ry="2"
                      ></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                  </span>
                )}
              </div>
              <div className="flex-1">
                <input
                  type="file"
                  id="logoUpload"
                  accept="image/png, image/jpeg, image/svg+xml"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <label
                  htmlFor="logoUpload"
                  role="button"
                  aria-label="Business logo upload karein"
                  className="inline-flex h-8 px-4 items-center justify-center rounded-md border border-border-default bg-surface-base text-sm font-medium text-text-primary hover:bg-neutral-50 transition-colors cursor-pointer focus-within:ring-2 focus-within:ring-brand-500"
                >
                  Logo upload karein
                </label>
                <p className="text-xs text-text-muted mt-2">
                  Accepted: PNG, JPG, SVG. Max 2MB. Square (1:1) ratio.
                </p>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={isLoading}
              className={`h-10 px-6 rounded-lg font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                isLoading
                  ? "bg-brand-400 text-white cursor-not-allowed"
                  : "bg-brand-600 hover:bg-brand-700 text-white shadow-1"
              }`}
            >
              {isLoading ? "Saving..." : "Brand Details Save Karein"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
