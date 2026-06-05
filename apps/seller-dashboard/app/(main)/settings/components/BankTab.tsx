"use client";

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../contexts/auth.context';
import { useToast } from '../../../../components/ui/Toast';
import { 
  getIfscDetails, 
  verifyBankAccount, 
  BankAccountVerifyDto 
} from '../../../../lib/api/settings.client';

type BankStatus = 'VERIFIED' | 'PENDING' | 'UNVERIFIED';

export function BankTab() {
  const { user, accessToken } = useAuth();
  const { addToast } = useToast();

  const [isLoadingIfsc, setIsLoadingIfsc] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeUser = user as any;
  const currentStatus: BankStatus = safeUser?.business?.bankVerificationStatus || 'UNVERIFIED';
  
  const [formData, setFormData] = useState<BankAccountVerifyDto>({
    accountHolderName: '',
    accountNumber: '',
    ifscCode: '',
    bankName: '',
    branchName: '',
  });

  // Track if we need to show the manual bank entry fields
  const [showManualBankEntry, setShowManualBankEntry] = useState(false);
  const [confirmAccount, setConfirmAccount] = useState('');

  useEffect(() => {
    // Pre-fill owner name as default account holder name for convenience
    if (user) {
      const name = safeUser.fullName || `${safeUser.firstName || ''} ${safeUser.lastName || ''}`.trim() || '';
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData(prev => ({ ...prev, accountHolderName: name }));
    }
  }, [user, safeUser]);

  const validateIfsc = (code: string) => {
    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(code.toUpperCase());
  };

  const handleIfscBlur = async () => {
    const code = formData.ifscCode.toUpperCase();
    if (!code) return;
    
    if (code.length !== 11 || !validateIfsc(code)) {
      setErrors(prev => ({ ...prev, ifscCode: "Sahi 11-digit IFSC code enter karein (e.g. SBIN0001234)" }));
      return;
    }
    
    if (!accessToken) return;

    setIsLoadingIfsc(true);
    setErrors(prev => { const newE = { ...prev }; delete newE.ifscCode; return newE; });
    setShowManualBankEntry(false);

    try {
      const res = await getIfscDetails(code, accessToken);
      if (res.success) {
        setFormData(prev => ({
          ...prev,
          bankName: res.data.bankName,
          branchName: res.data.branchName,
        }));
      } else {
        // Fallback: Enable manual entry if endpoint fails or returns error
        setFormData(prev => ({ ...prev, bankName: '', branchName: '' }));
        setShowManualBankEntry(true);
        addToast({ message: "IFSC verify nahi ho paya. Kripya Bank aur Branch manually enter karein.", variant: "warning" });
      }
    } catch {
      // Graceful fallback per user constraints: No fake data, allow manual entry
      setFormData(prev => ({ ...prev, bankName: '', branchName: '' }));
      setShowManualBankEntry(true);
      addToast({ message: "IFSC service abhi unavailable hai. Manually details bharein.", variant: "warning" });
    } finally {
      setIsLoadingIfsc(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'ifscCode') {
      setFormData(prev => ({ ...prev, [name]: value.toUpperCase() }));
      // Auto-trigger lookup if length is 11
      if (value.length === 11) {
        // We will just let the blur handle it or trigger it here if desired.
        // For now, let's keep it simple and just update state.
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
    
    if (errors[name]) {
      setErrors(prev => { const newE = { ...prev }; delete newE[name]; return newE; });
    }
  };

  const handleConfirmAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmAccount(e.target.value);
    if (errors.confirmAccount) {
      setErrors(prev => { const newE = { ...prev }; delete newE.confirmAccount; return newE; });
    }
  };

  const handleVerify = async () => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.accountHolderName.trim()) newErrors.accountHolderName = "Account holder name zaroori hai";
    if (!formData.accountNumber.trim()) newErrors.accountNumber = "Account number zaroori hai";
    if (formData.accountNumber !== confirmAccount) newErrors.confirmAccount = "Account numbers match nahi kar rahe";
    if (!formData.ifscCode.trim()) {
      newErrors.ifscCode = "IFSC code zaroori hai";
    } else if (!validateIfsc(formData.ifscCode)) {
      newErrors.ifscCode = "Sahi IFSC format enter karein";
    }
    
    if (showManualBankEntry) {
      if (!formData.bankName.trim()) newErrors.bankName = "Bank name zaroori hai";
      if (!formData.branchName.trim()) newErrors.branchName = "Branch name zaroori hai";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      addToast({ message: "Kripya form ki galtiyan theek karein", variant: "error" });
      return;
    }

    if (!accessToken) return;

    setIsVerifying(true);
    try {
      const res = await verifyBankAccount(formData, accessToken);
      if (res.success) {
        addToast({ message: "Bank verification initiate ho gaya! ₹1 micro-deposit jaldi aayega.", variant: "success" });
        // Simulating reload to update status to PENDING
        setTimeout(() => window.location.reload(), 1500);
      } else {
        addToast({ message: res.error || "Verification request fail ho gayi.", variant: "error" });
      }
    } catch {
      addToast({ message: "Server error. Kripya baad mein try karein.", variant: "error" });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-20 md:pb-0 animate-in fade-in duration-300">
      
      {/* STATUS CARD */}
      {currentStatus === 'VERIFIED' && (
        <div role="status" className="w-full bg-success-50 border-[1.5px] border-success-300 rounded-lg p-5 mb-8 flex items-start md:items-center gap-4">
          <div className="flex-shrink-0 text-success-500 mt-1 md:mt-0">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary">Bank Account Verified</h3>
            <p className="text-xs text-text-secondary mt-1">
              Aapka bank account verified hai. Payouts is account mein aayenge.
            </p>
          </div>
        </div>
      )}

      {currentStatus === 'PENDING' && (
        <div role="status" className="w-full bg-warning-50 border-[1.5px] border-warning-300 rounded-lg p-5 mb-8 flex items-start md:items-center gap-4">
          <div className="flex-shrink-0 text-warning-500 mt-1 md:mt-0">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary">Verification Pending</h3>
            <p className="text-xs text-text-secondary mt-1">
              ₹1 micro-deposit bheja gaya hai. Status 24-48 ghante mein update hoga.
            </p>
          </div>
        </div>
      )}

      {/* FORM SECTION */}
      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        <div className="p-5 md:p-6 border-b border-border-default">
          <h2 className="text-lg font-bold text-text-primary">Bank Details</h2>
          <p className="text-xs text-text-secondary mt-1">Aapke sabhi payouts isi account mein process honge.</p>
        </div>

        <div className="p-5 md:p-6 space-y-5">
          {currentStatus === 'VERIFIED' && (
            <div role="alert" className="bg-info-50 text-info-700 text-xs p-3 rounded border border-info-200">
              Note: Bank account change karne pe dobara verification lagegi aur purana account invalid ho jayega.
            </div>
          )}

          {/* Account Holder Name */}
          <div>
            <label htmlFor="accountHolderName" className="block text-sm font-medium text-text-primary mb-1">
              Account Holder Name
            </label>
            <input
              id="accountHolderName"
              name="accountHolderName"
              type="text"
              value={formData.accountHolderName}
              onChange={handleChange}
              className={`w-full h-10 px-3 py-2 text-base md:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-surface-base ${
                errors.accountHolderName ? "border-error-500 focus:border-error-500" : "border-border-default focus:border-transparent"
              }`}
            />
            {errors.accountHolderName && <p className="text-xs text-error-600 mt-1" role="alert">{errors.accountHolderName}</p>}
            <p className="text-[10px] text-text-muted mt-1">Name should match with your KYC documents</p>
          </div>

          {/* Account Number */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="accountNumber" className="block text-sm font-medium text-text-primary mb-1">
                Account Number
              </label>
              <input
                id="accountNumber"
                name="accountNumber"
                type="text"
                inputMode="numeric"
                value={formData.accountNumber}
                onChange={handleChange}
                className={`w-full h-10 px-3 py-2 text-base md:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-surface-base ${
                  errors.accountNumber ? "border-error-500 focus:border-error-500" : "border-border-default focus:border-transparent"
                }`}
              />
              {errors.accountNumber && <p className="text-xs text-error-600 mt-1" role="alert">{errors.accountNumber}</p>}
            </div>
            
            <div>
              <label htmlFor="confirmAccount" className="block text-sm font-medium text-text-primary mb-1">
                Confirm Account
              </label>
              <input
                id="confirmAccount"
                name="confirmAccount"
                type="password"
                inputMode="numeric"
                value={confirmAccount}
                onChange={handleConfirmAccountChange}
                className={`w-full h-10 px-3 py-2 text-base md:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors bg-surface-base ${
                  errors.confirmAccount ? "border-error-500 focus:border-error-500" : "border-border-default focus:border-transparent"
                }`}
              />
              {errors.confirmAccount && <p className="text-xs text-error-600 mt-1" role="alert">{errors.confirmAccount}</p>}
            </div>
          </div>

          {/* IFSC Code */}
          <div className="relative">
            <label htmlFor="ifscCode" className="block text-sm font-medium text-text-primary mb-1">
              IFSC Code
            </label>
            <div className="relative">
              <input
                id="ifscCode"
                name="ifscCode"
                type="text"
                maxLength={11}
                pattern="[A-Z]{4}0[A-Z0-9]{6}"
                value={formData.ifscCode}
                onChange={handleChange}
                onBlur={handleIfscBlur}
                className={`w-full h-10 px-3 py-2 text-base md:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors uppercase bg-surface-base ${
                  errors.ifscCode ? "border-error-500 focus:border-error-500" : "border-border-default focus:border-transparent"
                }`}
                placeholder="e.g. SBIN0001234"
              />
            </div>
            {errors.ifscCode && <p className="text-xs text-error-600 mt-1" role="alert">{errors.ifscCode}</p>}
          </div>

          {/* Bank & Branch (Auto-filled or Manual) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5" aria-live="polite">
            <div className="relative">
              <label htmlFor="bankName" className="block text-sm font-medium text-text-primary mb-1">
                Bank Name
              </label>
              <div className="relative">
                <input
                  id="bankName"
                  name="bankName"
                  type="text"
                  readOnly={!showManualBankEntry}
                  value={formData.bankName}
                  onChange={handleChange}
                  placeholder={isLoadingIfsc ? "Fetching..." : ""}
                  className={`w-full h-10 px-3 py-2 text-base md:text-sm border rounded-lg transition-colors ${
                    !showManualBankEntry 
                      ? "bg-neutral-50 text-text-secondary border-border-default focus:outline-none cursor-not-allowed" 
                      : errors.bankName ? "bg-surface-base border-error-500 focus:outline-none focus:ring-2 focus:ring-brand-500" : "bg-surface-base border-border-default focus:outline-none focus:ring-2 focus:ring-brand-500"
                  }`}
                />
                {isLoadingIfsc && (
                  <div className="absolute right-3 top-2.5">
                    <div className="w-5 h-5 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
              {showManualBankEntry && errors.bankName && <p className="text-xs text-error-600 mt-1" role="alert">{errors.bankName}</p>}
            </div>
            
            <div>
              <label htmlFor="branchName" className="block text-sm font-medium text-text-primary mb-1">
                Branch Name
              </label>
              <input
                id="branchName"
                name="branchName"
                type="text"
                readOnly={!showManualBankEntry}
                value={formData.branchName}
                onChange={handleChange}
                placeholder={isLoadingIfsc ? "Fetching..." : ""}
                className={`w-full h-10 px-3 py-2 text-base md:text-sm border rounded-lg transition-colors ${
                  !showManualBankEntry 
                    ? "bg-neutral-50 text-text-secondary border-border-default focus:outline-none cursor-not-allowed" 
                    : errors.branchName ? "bg-surface-base border-error-500 focus:outline-none focus:ring-2 focus:ring-brand-500" : "bg-surface-base border-border-default focus:outline-none focus:ring-2 focus:ring-brand-500"
                }`}
              />
              {showManualBankEntry && errors.branchName && <p className="text-xs text-error-600 mt-1" role="alert">{errors.branchName}</p>}
            </div>
          </div>
          
          <div className="pt-2">
            <button
              onClick={handleVerify}
              disabled={isVerifying}
              className={`w-full md:w-auto px-6 h-12 rounded-xl text-base font-medium flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                isVerifying 
                  ? 'bg-brand-400 text-white cursor-not-allowed' 
                  : 'bg-brand-600 hover:bg-brand-700 text-white shadow-1'
              }`}
            >
              {isVerifying ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div>
                  <span>Verifying...</span>
                </div>
              ) : (
                "Bank Account Verify Karein"
              )}
            </button>
            <p className="text-xs text-text-secondary mt-3">
              Aapke account mein ₹1 bheja jayega verify karne ke liye (24-48 hrs lagenge)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
