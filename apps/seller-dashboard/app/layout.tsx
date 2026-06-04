import type { Metadata, Viewport } from 'next';
import { AuthProvider } from './contexts/auth.context';
import { ToastProvider } from '../components/ui/Toast';
import { HeaderProvider } from './contexts/header.context';
import './globals.css';

/**
 * Root Layout — apps/seller-dashboard/app/layout.tsx
 *
 * Authority:
 *   seller_dashboard_uxui_system.md §4.1 (Font: Inter, preloaded)
 *   seller_dashboard_architecture.md §8 (AuthProvider at root)
 *
 * Providers wrapping order:
 *   AuthProvider (outer — needed by ToastProvider and all pages)
 *     → ToastProvider (inner — needs to be inside auth for toast on auth events)
 *       → children
 */

export const metadata: Metadata = {
  title: 'VyaparNet Seller Dashboard',
  description: 'VyaparNet Seller Hub — apne wholesale business ko manage karein. Products, orders, inventory, RFQ aur payments — sab ek jagah.',
  manifest: '/manifest.json',
  keywords: ['B2B', 'wholesale', 'seller', 'VyaparNet', 'vyapaar', 'dashboard'],
  robots: 'noindex', // Seller dashboard is private — no indexing
};

export const viewport: Viewport = {
  themeColor: '#1D4ED8', // brand-600
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="hi" className="antialiased">
      {/*
        Inter font — preloaded from Google Fonts.
        Authority: seller_dashboard_uxui_system.md §4.1
        Note: In production, self-host font for performance.
              In dev, Google Fonts CDN is acceptable.
      */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="bg-surface-app text-text-primary font-sans"
        style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
      >
        <AuthProvider>
          <HeaderProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </HeaderProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
