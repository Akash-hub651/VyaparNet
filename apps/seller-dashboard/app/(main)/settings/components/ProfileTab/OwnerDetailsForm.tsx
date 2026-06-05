"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../../../../contexts/auth.context";
import { updateBusinessProfile } from "../../../../../lib/api/settings.client";
import { useToast } from "../../../../../components/ui/Toast";

export function OwnerDetailsForm() {
  const { user, accessToken } = useAuth();
  const { addToast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    ownerName: "",
    email: "",
  });

  // Pre-fill from session
  useEffect(() => {
    if (user) {
      // Safely access fields, as UserProfileResponse might have varying shapes based on API design
      // @ts-expect-error type variance
      const name =
        user.fullName ||
        `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
        "";

      setFormData({
        ownerName: name,
        email: user.email || "",
      });
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const newErrs = { ...prev };
        delete newErrs[name];
        return newErrs;
      });
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === "email" && value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        setErrors((prev) => ({
          ...prev,
          email: "Sahi email address enter karein",
        }));
      }
    }
  };

  const handleSave = async () => {
    if (!formData.ownerName.trim()) {
      addToast({ message: "Owner name is required", variant: "error" });
      return;
    }
    if (errors.email) {
      addToast({
        message: "Sahi email address enter karein",
        variant: "error",
      });
      return;
    }

    if (!accessToken) return;

    setIsLoading(true);
    try {
      const res = await updateBusinessProfile(
        {
          ownerName: formData.ownerName,
          email: formData.email,
        },
        accessToken,
      );

      if (res.success) {
        addToast({
          message: "Owner details update ho gayi!",
          variant: "success",
        });
        if (formData.email !== user?.email) {
          addToast({
            message:
              "Verification email bheja gaya. Confirm karne ke baad update hoga.",
            variant: "info",
          });
        }
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
    <div className="space-y-5">
      {/* FIELD: Owner Name */}
      <div>
        <label
          htmlFor="ownerName"
          className="block text-sm font-medium text-text-primary mb-1"
        >
          Owner ka pura naam
        </label>
        <input
          id="ownerName"
          name="ownerName"
          type="text"
          maxLength={80}
          value={formData.ownerName}
          onChange={handleChange}
          className="w-full h-10 px-3 py-2 text-base md:text-sm border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors bg-surface-base"
        />
        <p className="text-xs text-text-secondary mt-1">As per KYC documents</p>
      </div>

      {/* FIELD: Mobile Number (READ-ONLY) */}
      <div>
        <label
          htmlFor="mobile"
          className="block text-sm font-medium text-text-primary mb-1"
        >
          Mobile number
        </label>
        <input
          id="mobile"
          name="mobile"
          type="text"
          disabled
          aria-readonly="true"
          aria-label="Mobile number — change nahi ho sakta"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          value={(user as any)?.mobile || (user as any)?.phoneNumber || ""}
          className="w-full h-10 px-3 py-2 text-base md:text-sm border border-border-default rounded-lg bg-neutral-50 text-text-secondary cursor-not-allowed"
        />
        <p className="text-xs text-text-secondary mt-1">
          Mobile change karne ke liye Support se contact karein
        </p>
      </div>

      {/* FIELD: Email */}
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-text-primary mb-1"
        >
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          onBlur={handleBlur}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? "email-error" : undefined}
          className={`w-full h-10 px-3 py-2 text-base md:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-surface-base ${
            errors.email
              ? "border-error-500 focus:border-error-500"
              : "border-border-default focus:border-transparent"
          }`}
        />
        {errors.email && (
          <p
            id="email-error"
            className="text-xs text-error-600 mt-1"
            role="alert"
          >
            {errors.email}
          </p>
        )}
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
          {isLoading ? "Saving..." : "Owner Details Save Karein"}
        </button>
      </div>
    </div>
  );
}
