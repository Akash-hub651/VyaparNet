"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../../../../contexts/auth.context";
import {
  getBusinessTypes,
  lookupPincode,
  updateBusinessProfile,
  BusinessTypeViewModel,
} from "../../../../../lib/api/settings.client";
import { useToast } from "../../../../../components/ui/Toast";

// Hardcoded UTs + States fallback (in case Sprint 8 config fetch is missing)
const INDIA_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

const FALLBACK_BUSINESS_TYPES: BusinessTypeViewModel[] = [
  { id: "Manufacturer", name: "Manufacturer" },
  { id: "Trader", name: "Trader" },
  { id: "Distributor", name: "Distributor" },
  { id: "Agent", name: "Agent" },
  { id: "Retailer", name: "Retailer" },
];

export function BusinessDetailsForm() {
  const { user, accessToken } = useAuth();
  const { addToast } = useToast();

  const [isLoadingTypes, setIsLoadingTypes] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUpPin, setIsLookingUpPin] = useState(false);

  const [businessTypes, setBusinessTypes] = useState<BusinessTypeViewModel[]>(
    [],
  );

  const [formData, setFormData] = useState({
    businessName: "",
    businessType: "",
    gstNumber: "",
    panNumber: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Fetch Business Types & Pre-fill
  useEffect(() => {
    let mounted = true;

    async function loadConfig() {
      if (!accessToken) return;
      try {
        const res = await getBusinessTypes(accessToken);
        if (mounted) {
          if (res.success && res.data && res.data.length > 0) {
            setBusinessTypes(res.data);
          } else {
            // Graceful fallback if endpoint not ready
            setBusinessTypes(FALLBACK_BUSINESS_TYPES);
            addToast({
              message: "Loaded fallback business types",
              variant: "info",
            });
          }
        }
      } catch {
        if (mounted) {
          setBusinessTypes(FALLBACK_BUSINESS_TYPES);
          addToast({
            message: "Failed to load business types config from server",
            variant: "error",
          });
        }
      } finally {
        if (mounted) setIsLoadingTypes(false);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safeUser = user as any;
    if (safeUser && (safeUser.business || safeUser.businesses)) {
      const b = safeUser.business || safeUser.businesses?.[0];

      setFormData({
        businessName: b.businessName || "",
        businessType: b.businessType || "",
        gstNumber: b.gstNumber || "",
        panNumber: b.panNumber || "",
        address: b.address || "",
        city: b.city || "",
        state: b.state || "",
        pincode: b.pincode || "",
      });
    }

    loadConfig();

    return () => {
      mounted = false;
    };
  }, [user, accessToken, addToast]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value } = e.target;

    // Auto-uppercase PAN/GST
    let finalValue = value;
    if (name === "panNumber" || name === "gstNumber") {
      finalValue = value.toUpperCase();
    }

    setFormData((prev) => ({ ...prev, [name]: finalValue }));

    // Clear field-specific error on typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrs = { ...prev };
        delete newErrs[name];
        return newErrs;
      });
    }

    // Auto-lookup PIN Code on exactly 6 digits
    if (
      name === "pincode" &&
      finalValue.length === 6 &&
      /^\d{6}$/.test(finalValue)
    ) {
      handlePincodeLookup(finalValue);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const newErrs = { ...errors };

    if (name === "businessName" && value) {
      if (value.length < 3) {
        newErrs.businessName = "Min 3 characters required";
      } else if (!/^[a-zA-Z0-9\s&.-]+$/.test(value)) {
        newErrs.businessName = "Only letters, numbers, &, -, . allowed";
      }
    } else if (name === "gstNumber" && value) {
      const gstRegex = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d{1}Z\d{1}$/;
      if (!gstRegex.test(value)) newErrs.gstNumber = "Invalid GST Format";
    } else if (name === "panNumber" && value) {
      const panRegex = /^[A-Z]{5}\d{4}[A-Z]{1}$/;
      if (!panRegex.test(value)) newErrs.panNumber = "Invalid PAN Format";
    }

    setErrors(newErrs);
  };

  const handlePincodeLookup = async (pin: string) => {
    if (!accessToken) return;
    setIsLookingUpPin(true);

    try {
      const res = await lookupPincode(pin, accessToken);
      if (res.success && res.data) {
        setFormData((prev) => ({
          ...prev,
          city: res.data!.city,
          state: res.data!.state,
        }));
        addToast({
          message: `City aur state auto-fill ho gaya: ${res.data!.city}, ${res.data!.state}`,
          variant: "success",
        });
      } else {
        setErrors((prev) => ({
          ...prev,
          pincode: "Ye PIN code valid nahi hai",
        }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, pincode: "Ye PIN code valid nahi hai" }));
    } finally {
      setIsLookingUpPin(false);
    }
  };

  const handleSave = async () => {
    // Basic validation check before submit
    if (!formData.businessName || formData.businessName.length < 3) {
      addToast({
        message: "Business Name must be at least 3 characters",
        variant: "error",
      });
      return;
    }
    if (!/^[a-zA-Z0-9\s&.-]+$/.test(formData.businessName)) {
      addToast({
        message: "Business Name contains invalid characters",
        variant: "error",
      });
      return;
    }
    if (!formData.panNumber) {
      addToast({ message: "PAN Number required", variant: "error" });
      return;
    }
    if (Object.keys(errors).length > 0) {
      addToast({
        message: "Please fix the errors before saving",
        variant: "error",
      });
      return;
    }

    if (!accessToken) return;

    setIsSaving(true);
    try {
      const res = await updateBusinessProfile(formData, accessToken);
      if (res.success) {
        addToast({
          message: "Business details update ho gayi!",
          variant: "success",
        });
      } else {
        // Fallback for Sprint 8
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
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Business Name & Type row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label
            htmlFor="businessName"
            className="block text-sm font-medium text-text-primary mb-1"
          >
            Business ka naam <span className="text-error-600">*</span>
          </label>
          <input
            id="businessName"
            name="businessName"
            type="text"
            maxLength={100}
            required
            value={formData.businessName}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-invalid={!!errors.businessName}
            aria-describedby={
              errors.businessName ? "businessName-error" : undefined
            }
            className={`w-full h-10 px-3 py-2 text-base md:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-surface-base ${
              errors.businessName
                ? "border-error-500 focus:border-error-500"
                : "border-border-default focus:border-transparent"
            }`}
          />
          {errors.businessName ? (
            <p
              id="businessName-error"
              className="text-xs text-error-600 mt-1"
              role="alert"
            >
              {errors.businessName}
            </p>
          ) : (
            <p className="text-xs text-text-secondary mt-1">
              Ye buyers ko dikhega
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="businessType"
            className="block text-sm font-medium text-text-primary mb-1"
          >
            Business Type <span className="text-error-600">*</span>
          </label>
          <select
            id="businessType"
            name="businessType"
            required
            value={formData.businessType}
            onChange={handleChange}
            disabled={isLoadingTypes}
            className="w-full h-10 px-3 py-2 text-base md:text-sm border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-surface-base disabled:bg-neutral-50 disabled:cursor-not-allowed"
          >
            <option value="" disabled>
              Select Type
            </option>
            {businessTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* PAN & GST row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <label
            htmlFor="panNumber"
            className="block text-sm font-medium text-text-primary mb-1"
          >
            PAN Number <span className="text-error-600">*</span>
          </label>
          <input
            id="panNumber"
            name="panNumber"
            type="text"
            maxLength={10}
            required
            value={formData.panNumber}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-invalid={!!errors.panNumber}
            aria-describedby={errors.panNumber ? "panNumber-error" : undefined}
            className={`w-full h-10 px-3 py-2 text-base md:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-surface-base uppercase ${
              errors.panNumber
                ? "border-error-500 focus:border-error-500"
                : "border-border-default focus:border-transparent"
            }`}
          />
          {errors.panNumber && (
            <p
              id="panNumber-error"
              className="text-xs text-error-600 mt-1"
              role="alert"
            >
              {errors.panNumber}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="gstNumber"
            className="block text-sm font-medium text-text-primary mb-1"
          >
            GST Number
          </label>
          <input
            id="gstNumber"
            name="gstNumber"
            type="text"
            maxLength={15}
            value={formData.gstNumber}
            onChange={handleChange}
            onBlur={handleBlur}
            aria-invalid={!!errors.gstNumber}
            aria-describedby={errors.gstNumber ? "gstNumber-error" : undefined}
            className={`w-full h-10 px-3 py-2 text-base md:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-surface-base uppercase ${
              errors.gstNumber
                ? "border-error-500 focus:border-error-500"
                : "border-border-default focus:border-transparent"
            }`}
          />
          {errors.gstNumber ? (
            <p
              id="gstNumber-error"
              className="text-xs text-error-600 mt-1"
              role="alert"
            >
              {errors.gstNumber}
            </p>
          ) : (
            <p className="text-xs text-text-secondary mt-1">
              15-digit GST identification number
            </p>
          )}
        </div>
      </div>

      {/* Address Textarea */}
      <div>
        <label
          htmlFor="address"
          className="block text-sm font-medium text-text-primary mb-1"
        >
          Business Address <span className="text-error-600">*</span>
        </label>
        <textarea
          id="address"
          name="address"
          rows={3}
          required
          value={formData.address}
          onChange={handleChange}
          className="w-full px-3 py-2 text-base md:text-sm border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-surface-base resize-y"
        />
        <p className="text-xs text-text-secondary mt-1">
          Complete address with street, building, area
        </p>
      </div>

      {/* PIN, City, State row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div>
          <label
            htmlFor="pincode"
            className="block text-sm font-medium text-text-primary mb-1"
          >
            PIN Code <span className="text-error-600">*</span>
          </label>
          <div className="relative">
            <input
              id="pincode"
              name="pincode"
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={formData.pincode}
              onChange={handleChange}
              aria-invalid={!!errors.pincode}
              aria-describedby={errors.pincode ? "pincode-error" : undefined}
              className={`w-full h-10 px-3 py-2 text-base md:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-surface-base pr-10 ${
                errors.pincode
                  ? "border-error-500 focus:border-error-500"
                  : "border-border-default focus:border-transparent"
              }`}
            />
            {isLookingUpPin && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <svg
                  className="animate-spin h-4 w-4 text-brand-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
            )}
          </div>
          {errors.pincode && (
            <p
              id="pincode-error"
              className="text-xs text-error-600 mt-1"
              role="alert"
            >
              {errors.pincode}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="city"
            className="block text-sm font-medium text-text-primary mb-1"
          >
            City <span className="text-error-600">*</span>
          </label>
          <input
            id="city"
            name="city"
            type="text"
            required
            value={formData.city}
            onChange={handleChange}
            className="w-full h-10 px-3 py-2 text-base md:text-sm border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-surface-base"
          />
        </div>

        <div>
          <label
            htmlFor="state"
            className="block text-sm font-medium text-text-primary mb-1"
          >
            State <span className="text-error-600">*</span>
          </label>
          <select
            id="state"
            name="state"
            required
            value={formData.state}
            onChange={handleChange}
            className="w-full h-10 px-3 py-2 text-base md:text-sm border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-surface-base"
          >
            <option value="" disabled>
              Select State
            </option>
            {INDIA_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Save Button */}
      <div className="pt-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={`h-10 px-6 rounded-lg font-medium text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
            isSaving
              ? "bg-brand-400 text-white cursor-not-allowed"
              : "bg-brand-600 hover:bg-brand-700 text-white shadow-1"
          }`}
        >
          {isSaving ? "Saving..." : "Badlaav Save Karein"}
        </button>
      </div>
    </div>
  );
}
