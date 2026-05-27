'use client';

/**
 * AuthProvider — apps/seller-dashboard/app/contexts/auth.context.tsx
 *
 * Seller-dashboard auth state management.
 * Mirrors web app AuthProvider pattern for consistency.
 *
 * Token storage: access token in memory (never localStorage — XSS risk).
 * Refresh token: in memory. Lost on page reload → user must re-login (MVP acceptable).
 */

import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { UserProfileResponse, AuthTokensResponse } from '@vyaparnet/types';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

interface AuthContextValue {
  user: UserProfileResponse | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (tokens: AuthTokensResponse) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<UserProfileResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  const fetchUserProfile = async (token: string): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { success: true; data: UserProfileResponse };
        setUser(data.data);
      }
    } catch {
      setUser(null);
    }
  };

  const login = (tokens: AuthTokensResponse): void => {
    setAccessToken(tokens.accessToken);
    setRefreshToken(tokens.refreshToken);
    void fetchUserProfile(tokens.accessToken);
  };

  const logout = async (): Promise<void> => {
    if (accessToken) {
      try {
        await fetch(`${API_BASE}/api/v1/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      } catch { /* ignore */ }
    }
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
  };

  const refreshUser = async (): Promise<void> => {
    if (accessToken) await fetchUserProfile(accessToken);
  };

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, isAuthenticated: !!user, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
