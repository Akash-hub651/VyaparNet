"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../../contexts/auth.context';
import { useToast } from '../../../../components/ui/Toast';
import { 
  getNotificationPreferences, 
  updateNotificationPreferences, 
  NotificationPreferences 
} from '../../../../lib/api/settings.client';

export function NotificationsTab() {
  const { accessToken } = useAuth();
  const { addToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    orderReceived: true,
    orderStatusUpdate: true,
    returnRequest: true,
    rfqReceived: true,
    quoteAccepted: true,
    payoutInitiated: true,
    lowStockAlert: true,
    lowStockThreshold: 10,
    kycStatusChange: true,
    accountStatusChange: true,
  });

  const isInitialMount = useRef(true);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPreferences = async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await getNotificationPreferences(accessToken);
      if (res.success && res.data) {
        setPreferences({
          orderReceived: res.data.orderReceived ?? true,
          orderStatusUpdate: res.data.orderStatusUpdate ?? true,
          returnRequest: res.data.returnRequest ?? true,
          rfqReceived: res.data.rfqReceived ?? true,
          quoteAccepted: res.data.quoteAccepted ?? true,
          payoutInitiated: res.data.payoutInitiated ?? true,
          lowStockAlert: res.data.lowStockAlert ?? true,
          lowStockThreshold: res.data.lowStockThreshold ?? 10,
          kycStatusChange: true, // Fixed
          accountStatusChange: true, // Fixed
        });
      }
    } catch {
      addToast({ message: "Preferences load karne mein error aayi", variant: "error" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPreferences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Use callback for the debounced save to avoid stale closures if needed
  const savePreferences = useCallback(async (newPrefs: NotificationPreferences) => {
    if (!accessToken) return;
    try {
      const res = await updateNotificationPreferences(newPrefs, accessToken);
      if (res.success) {
        addToast({ message: "Preferences save ho gayi", variant: "success" });
      } else {
        addToast({ message: "Preferences save nahi ho payi. Dobara try karein.", variant: "error" });
      }
    } catch {
      addToast({ message: "Network error. Preferences save nahi ho payi.", variant: "error" });
    }
  }, [accessToken, addToast]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Debounce saves by 300ms
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      savePreferences(preferences);
    }, 300);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [preferences, savePreferences]);

  const handleToggle = (key: keyof NotificationPreferences) => {
    // Prevent changing fixed preferences
    if (key === 'kycStatusChange' || key === 'accountStatusChange') return;
    
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key as keyof NotificationPreferences]
    }));
  };

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 0) {
      setPreferences(prev => ({
        ...prev,
        lowStockThreshold: val
      }));
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-pulse">
        <div className="h-40 bg-surface-card rounded-xl border border-border-default"></div>
        <div className="h-40 bg-surface-card rounded-xl border border-border-default"></div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-20 md:pb-0 animate-in fade-in duration-300 space-y-6">
      
      {/* SECTION 1: Order Notifications */}
      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        <div className="p-5 border-b border-border-default">
          <h3 className="text-base font-bold text-text-primary">Order Notifications</h3>
        </div>
        <div className="divide-y divide-border-default">
          <ToggleRow 
            label="Naye order aane pe notification" 
            checked={preferences.orderReceived} 
            onChange={() => handleToggle('orderReceived')} 
          />
          <ToggleRow 
            label="Order status update pe" 
            checked={preferences.orderStatusUpdate} 
            onChange={() => handleToggle('orderStatusUpdate')} 
          />
          <ToggleRow 
            label="Return request aane pe" 
            checked={preferences.returnRequest} 
            onChange={() => handleToggle('returnRequest')} 
          />
        </div>
      </div>

      {/* SECTION 2: Business Notifications */}
      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        <div className="p-5 border-b border-border-default">
          <h3 className="text-base font-bold text-text-primary">Business Notifications</h3>
        </div>
        <div className="divide-y divide-border-default">
          <ToggleRow 
            label="RFQ aane pe" 
            checked={preferences.rfqReceived} 
            onChange={() => handleToggle('rfqReceived')} 
          />
          <ToggleRow 
            label="Quote accept/reject hone pe" 
            checked={preferences.quoteAccepted} 
            onChange={() => handleToggle('quoteAccepted')} 
          />
          <ToggleRow 
            label="Payout initiate hone pe" 
            checked={preferences.payoutInitiated} 
            onChange={() => handleToggle('payoutInitiated')} 
          />
        </div>
      </div>

      {/* SECTION 3: Stock Alerts */}
      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden">
        <div className="p-5 border-b border-border-default">
          <h3 className="text-base font-bold text-text-primary">Stock Alerts</h3>
        </div>
        <div className="divide-y divide-border-default">
          <ToggleRow 
            label="Low stock alert" 
            checked={preferences.lowStockAlert} 
            onChange={() => handleToggle('lowStockAlert')} 
          />
          {preferences.lowStockAlert && (
            <div className="p-5 bg-neutral-50 flex items-center justify-between">
              <div>
                <label htmlFor="lowStockThreshold" className="text-sm font-medium text-text-primary">Low stock threshold</label>
                <p className="text-xs text-text-secondary mt-0.5">Jab stock is number se neeche jayega toh alert milega</p>
              </div>
              <div className="w-20">
                <input 
                  id="lowStockThreshold"
                  type="number" 
                  min="0"
                  value={preferences.lowStockThreshold}
                  onChange={handleThresholdChange}
                  className="w-full h-10 px-3 text-sm text-center border border-border-default rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 4: Account Notifications (Fixed) */}
      <div className="bg-surface-card border border-border-default rounded-xl overflow-hidden opacity-80">
        <div className="p-5 border-b border-border-default flex justify-between items-center">
          <h3 className="text-base font-bold text-text-primary">Account Notifications</h3>
          <span className="text-xs bg-neutral-100 text-text-secondary px-2 py-1 rounded font-medium">Fixed</span>
        </div>
        <div className="divide-y divide-border-default">
          <ToggleRow 
            label="KYC status change" 
            checked={true} 
            onChange={() => {}} 
            disabled={true}
            description="Important account updates off nahi kiye ja sakte"
          />
          <ToggleRow 
            label="Account status change" 
            checked={true} 
            onChange={() => {}} 
            disabled={true}
          />
        </div>
      </div>
      
    </div>
  );
}

// Sub-component for a toggle row
function ToggleRow({ 
  label, 
  description,
  checked, 
  onChange, 
  disabled = false 
}: { 
  label: string; 
  description?: string;
  checked: boolean; 
  onChange: () => void; 
  disabled?: boolean;
}) {
  return (
    <div className="p-5 flex items-center justify-between gap-4">
      <div className="flex-1">
        <h4 className={`text-sm font-medium ${disabled ? 'text-text-secondary' : 'text-text-primary'}`}>{label}</h4>
        {description && <p className="text-xs text-text-muted mt-0.5">{description}</p>}
      </div>
      
      <button
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        disabled={disabled}
        aria-label={label}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
          checked ? 'bg-brand-600' : 'bg-neutral-200'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
