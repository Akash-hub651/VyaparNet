import { useState, useEffect } from 'react';
import { useAuth } from '../../app/contexts/auth.context';

export interface ColumnDef {
  id: string;
  label: string;
  isMandatory?: boolean;
}

export function useColumnCustomization(moduleName: string, initialColumns: ColumnDef[]) {
  const { user } = useAuth();
  
  // Try to safely extract businessId
  const typedUser = user as unknown as Record<string, unknown> | null;
  const business = typedUser?.['business'] as Record<string, unknown> | undefined;
  const businessId = (business?.['id'] as string) || (typedUser?.['id'] as string) || 'unknown';
  
  const defaultVisibleIds = initialColumns.map(c => c.id);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(defaultVisibleIds);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    
    const key = `seller-${moduleName}-columns-${businessId}`;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Always ensure mandatory columns are present
          const mandatoryIds = initialColumns.filter(c => c.isMandatory).map(c => c.id);
          const combined = Array.from(new Set([...parsed, ...mandatoryIds]));
          setVisibleColumnIds(combined);
        }
      }
    } catch (e) {
      console.error('Failed to load column preferences', e);
    }
    setIsLoaded(true);
  }, [businessId, moduleName, initialColumns]);

  const toggleColumn = (id: string) => {
    const col = initialColumns.find(c => c.id === id);
    if (col?.isMandatory) return; // Cannot toggle mandatory columns

    setVisibleColumnIds(prev => {
      let next;
      if (prev.includes(id)) {
        next = prev.filter(c => c !== id);
      } else {
        // Maintain original order
        const newSet = new Set(prev);
        newSet.add(id);
        
        next = initialColumns
          .filter(c => newSet.has(c.id))
          .map(c => c.id);
      }
      
      if (businessId) {
        localStorage.setItem(`seller-${moduleName}-columns-${businessId}`, JSON.stringify(next));
      }
      return next;
    });
  };

  const resetColumns = () => {
    setVisibleColumnIds(defaultVisibleIds);
    if (businessId) {
      localStorage.removeItem(`seller-${moduleName}-columns-${businessId}`);
    }
  };

  return {
    visibleColumnIds,
    toggleColumn,
    resetColumns,
    isLoaded
  };
}
