'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminLogin, ApiError } from '../../lib/api';

export default function LoginPage(): React.JSX.Element {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await adminLogin(email, password);
      router.push('/businesses');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Invalid credentials or insufficient privileges.');
        } else {
          setError(`Login failed: ${err.message}`);
        }
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#1E293B]">VyaparNet</h1>
          <p className="text-[#64748B] mt-1 text-sm">Admin Panel — Platform Governance</p>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8 space-y-5"
        >
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[#1E293B] mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-4 py-3 text-sm text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
              placeholder="admin@vyaparnet.in"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[#1E293B] mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-[#E2E8F0] rounded-lg px-4 py-3 text-sm text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            id="login-btn"
            type="submit"
            disabled={loading}
            className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold py-3 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-[#94A3B8] mt-6">
          Only ADMIN role accounts can access this panel.
        </p>
      </div>
    </div>
  );
}
