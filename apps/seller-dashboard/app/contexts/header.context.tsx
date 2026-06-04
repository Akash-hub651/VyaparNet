'use client';

/**
 * Header Context — app/contexts/header.context.tsx
 *
 * Authority: seller_dashboard_architecture.md §6 (Top Navigation Architecture)
 * "Each page exports a PAGE_TITLE constant. SellerHeader reads from a HeaderContext."
 *
 * Pattern:
 *   Each page calls: useHeader().setTitle('Orders')
 *   SellerHeader reads: useHeader().title
 *
 * This avoids DOM manipulation and provides a React-idiomatic page title system.
 */

import React, {
  createContext, useContext, useState, useCallback, type ReactNode,
} from 'react';

interface HeaderContextValue {
  /** Current page title shown in breadcrumb/header */
  title: string;
  /** Current page subtitle (optional — shown below title on detail pages) */
  subtitle?: string;
  /** Set the page title. Call from each page's useEffect on mount. */
  setTitle: (title: string, subtitle?: string) => void;
  /** Reset to empty (called by layout on unmount) */
  clearTitle: () => void;
}

const HeaderContext = createContext<HeaderContextValue | undefined>(undefined);

export function HeaderProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [title, setTitleState] = useState('');
  const [subtitle, setSubtitle] = useState<string | undefined>(undefined);

  const setTitle = useCallback((t: string, sub?: string) => {
    setTitleState(t);
    setSubtitle(sub);
  }, []);

  const clearTitle = useCallback(() => {
    setTitleState('');
    setSubtitle(undefined);
  }, []);

  return (
    <HeaderContext.Provider value={{ title, subtitle, setTitle, clearTitle }}>
      {children}
    </HeaderContext.Provider>
  );
}

/**
 * useHeader — call from any page to set the header title.
 *
 * Usage:
 *   const { setTitle } = useHeader();
 *   useEffect(() => { setTitle('Orders'); }, [setTitle]);
 */
export function useHeader(): HeaderContextValue {
  const ctx = useContext(HeaderContext);
  if (!ctx) throw new Error('useHeader must be used within HeaderProvider');
  return ctx;
}
