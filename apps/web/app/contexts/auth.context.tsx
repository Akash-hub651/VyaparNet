'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { UserProfileResponse, AuthTokensResponse } from '@vyaparnet/types';

interface AuthContextValue {
  user: UserProfileResponse | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (tokens: AuthTokensResponse) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * AuthProvider — manages auth state for buyer PWA.
 *
 * Token storage: access token in memory (never localStorage).
 * Refresh token: in memory (for session continuity within tab).
 *
 * SECURITY: No tokens in localStorage (XSS risk).
 * Tradeoff: refresh token lost on page reload → user must re-login.
 * This is acceptable for MVP. Sprint 2 (Phase 2): consider secure httpOnly cookie.
 */
export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<UserProfileResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // On mount: no auto-restore (tokens in memory only)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(false);
  }, []);

  const login = (tokens: AuthTokensResponse): void => {
    setAccessToken(tokens.accessToken);
    setRefreshToken(tokens.refreshToken);
    // Fetch user profile after login
    void fetchUserProfile(tokens.accessToken);
  };

  const fetchUserProfile = async (token: string): Promise<void> => {
    try {
      const response = await fetch('/api/v1/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json() as { success: true; data: UserProfileResponse };
        setUser(data.data);
      }
    } catch {
      setUser(null);
    }
  };

  const logout = async (): Promise<void> => {
    if (accessToken) {
      try {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken }),
        });
      } catch { /* ignore logout errors */ }
    }
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
  };

  const refreshUser = async (): Promise<void> => {
    if (accessToken) {
      await fetchUserProfile(accessToken);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
