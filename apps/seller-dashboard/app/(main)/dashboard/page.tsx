'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { useHeader } from '../../contexts/header.context';
import { useAuth } from '../../contexts/auth.context';
import { useSellerPermissions } from '../../../lib/hooks/useSellerPermissions';

import { 
  getKpis, 
  getScorecard, 
  getRecentOrders,
  type SellerKpiDto,
  type SellerScorecardDto,
  type RecentOrderPreviewDto
} from '../../../lib/api/dashboard.client';

import { AlertStrip } from './AlertStrip';
import { DashboardKpiCards } from './DashboardKpiCards';
import { RecentOrdersWidget } from './RecentOrdersWidget';
import { QuickActionsWidget } from './QuickActionsWidget';
import { ScorecardWidget } from './ScorecardWidget';
import { SavedViewsWidget } from './SavedViewsWidget';

export default function DashboardPage(): React.JSX.Element {
  const { setTitle } = useHeader();
  const { accessToken } = useAuth();
  const perms = useSellerPermissions();

  const [isLoading, setIsLoading] = useState(true);
  const [kpis, setKpis] = useState<SellerKpiDto | undefined>();
  const [scorecard, setScorecard] = useState<SellerScorecardDto | undefined>();
  const [recentOrders, setRecentOrders] = useState<RecentOrderPreviewDto[]>([]);
  
  const [ordersError, setOrdersError] = useState<Error | undefined>();
  const [scorecardError, setScorecardError] = useState<Error | undefined>();
  
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  useEffect(() => {
    setTitle('Dashboard');
  }, [setTitle]);

  const fetchData = useCallback(async () => {
    if (!accessToken || perms.businessMissing) return;
    
    setIsLoading(true);
    setOrdersError(undefined);
    setScorecardError(undefined);

    try {
      // Parallel fetch pattern (ARCH-REV-SD-14 RESOLVED)
      const [kpiRes, scoreRes, ordersRes] = await Promise.all([
        getKpis(accessToken).catch(() => null),
        getScorecard(accessToken).catch(() => null),
        getRecentOrders(accessToken).catch(() => null)
      ]);

      if (kpiRes && kpiRes.success) setKpis(kpiRes.data);
      
      if (scoreRes && scoreRes.success) {
        setScorecard(scoreRes.data);
      } else {
        setScorecardError(new Error('Failed to load scorecard'));
      }

      if (ordersRes && ordersRes.success) {
        setRecentOrders(ordersRes.data.items);
      } else {
        setOrdersError(new Error('Failed to load orders'));
      }

      setLastUpdated(new Date());
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, perms.businessMissing]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
    
    // Auto-refresh every 5 minutes (300000ms)
    const interval = setInterval(() => {
      fetchData();
    }, 300000);
    
    return () => clearInterval(interval);
  }, [fetchData]);

  // Handle business missing state
  if (perms.businessMissing) {
    return (
      <div className="p-6">
        <div className="bg-error-50 border border-error-200 text-error-700 p-4 rounded-lg">
          Aapka business profile nahi mila. Kripya login dobara karein.
        </div>
      </div>
    );
  }

  // Calculate relative time for "last updated"
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - lastUpdated.getTime()) / 60000);
  const lastUpdatedText = diffMinutes === 0 ? 'Abhi update hua' : `${diffMinutes} min pehle`;

  // Provide mock saved views for demonstration since we don't have an API for it yet
  const mockSavedViews = [
    { id: '1', name: 'High Value Orders', type: 'orders' as const, lastUsedAt: new Date(Date.now() - 3600000).toISOString() },
    { id: '2', name: 'Low Stock Electronics', type: 'products' as const, lastUsedAt: new Date(Date.now() - 86400000).toISOString() }
  ];

  return (
    <div className="w-full max-w-[1440px] mx-auto pb-12">
      
      {/* ROW A: Alert Strip (Renders above page padding) */}
      <AlertStrip 
        pendingOrdersAgingCount={0} // Simplification
        lowStockCount={kpis?.lowStock}
        activeDisputesCount={0}
      />

      <div className="px-4 md:px-6">
        
        {/* ROW B: Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <h1 className="text-2xl font-bold text-text-primary hidden sm:block">Dashboard</h1>
          <div className="flex items-center gap-4 self-end sm:self-auto">
            <span className="text-sm text-text-secondary">
              last updated: {lastUpdatedText}
            </span>
            <button 
              onClick={() => fetchData()}
              disabled={isLoading}
              className="flex items-center gap-2 text-sm font-medium text-brand-600 hover:bg-brand-50 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* ROW C: KPI Cards */}
        <DashboardKpiCards data={kpis} scoreData={scorecard} isLoading={isLoading} />

        {/* ROW D: Split Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Main Content (span-8) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <RecentOrdersWidget 
              orders={recentOrders} 
              isLoading={isLoading} 
              error={ordersError} 
              onRetry={fetchData} 
            />
            
            <QuickActionsWidget />
          </div>
          
          {/* Aside (span-4) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <ScorecardWidget 
              data={scorecard} 
              isLoading={isLoading} 
              error={scorecardError} 
            />
            
            <SavedViewsWidget views={mockSavedViews} />
          </div>

        </div>
        
      </div>
    </div>
  );
}
