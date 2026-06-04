'use client';

/**
 * AuthProvider — apps/seller-dashboard/app/contexts/auth.context.tsx
 *
 * Seller-dashboard auth state management.
 * Authority: seller_dashboard_architecture.md §10 (Permission Architecture)
 *
 * SECURITY HARDENING (v2.0):
 * - Tokens: in-memory ONLY. Never localStorage — XSS risk.
 * - isAuthenticated = !!accessToken && !!user (both required — no race flash)
 * - Port: NEXT_PUBLIC_API_URL env var; fallback to 3003 (dev only)
 * - 401 from API client → dispatches 'auth:401' event → handled below
 * - logout is declared before the 401 useEffect to fix hoisting issue
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import type { UserProfileResponse, AuthTokensResponse } from '@vyaparnet/types';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3003';

/* ── CONTEXT TYPE ────────────────────────────────────────────── */
interface AuthContextValue {
  user: UserProfileResponse | null;
  accessToken: string | null;
  isLoading: boolean;
  /** True only when BOTH accessToken AND user profile are populated */
  isAuthenticated: boolean;
  login: (tokens: AuthTokensResponse) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/* ── PROVIDER ────────────────────────────────────────────────── */
export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<UserProfileResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  // isLoading: true until auth state is confirmed (prevents unauthenticated flash)
  const [isLoading, setIsLoading] = useState(false); // false = no prior session on mount

  // Stable refs for use inside event listeners (avoids stale closure issues)
  // Updated via useEffect (not during render) to satisfy lint rules
  const accessTokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    refreshTokenRef.current = refreshToken;
  }, [refreshToken]);

  // isAuthenticated: BOTH token AND user profile required
  const isAuthenticated = !!accessToken && !!user;

  /* ── FETCH USER PROFILE ──────────────────────────────────────── */
  async function fetchUserProfile(token: string): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.status === 401) {
        // Invalid token — clear session
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        return;
      }
      if (res.ok) {
        const data = await res.json() as { success: true; data: UserProfileResponse };
        setUser(data.data);
      }
    } catch {
      // Network error — don't clear token (allow retry)
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  /* ── LOGOUT ──────────────────────────────────────────────────── */
  // Declared before the 401 useEffect to avoid hoisting issue
  async function performLogout(): Promise<void> {
    const token = accessTokenRef.current;
    const refresh = refreshTokenRef.current;
    if (token) {
      try {
        await fetch(`${API_BASE}/api/v1/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken: refresh }),
        });
      } catch { /* Fire-and-forget — always clear local state */ }
    }
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
  }

  /* ── 401 GLOBAL EVENT LISTENER ───────────────────────────────── */
  // API client dispatches 'auth:401' when any request gets a 401 response.
  // This allows centralized session clearing without prop drilling.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    function handleUnauthorized() {
      void performLogout();
    }
    window.addEventListener('auth:401', handleUnauthorized);
    return () => window.removeEventListener('auth:401', handleUnauthorized);
  // performLogout uses refs — stable, no dep needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── LOGIN ───────────────────────────────────────────────────── */
  function login(tokens: AuthTokensResponse): void {
    setIsLoading(true); // hold loading until profile resolves
    setAccessToken(tokens.accessToken);
    setRefreshToken(tokens.refreshToken);
    void fetchUserProfile(tokens.accessToken);
  }

  /* ── REFRESH USER ────────────────────────────────────────────── */
  async function refreshUser(): Promise<void> {
    if (accessToken) await fetchUserProfile(accessToken);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isLoading,
        isAuthenticated,
        login,
        logout: performLogout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* ── HOOK ────────────────────────────────────────────────────── */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
