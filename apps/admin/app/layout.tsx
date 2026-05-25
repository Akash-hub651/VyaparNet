import type { Metadata } from 'next';
import { Inter, Manrope } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VyaparNet — Bharat ka B2B Marketplace',
  description: 'Verified wholesale procurement network for Bharat retailers.',
  manifest: '/manifest.json',
  themeColor: '#2563EB',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <html lang="hi" className={`${inter.variable} ${manrope.variable}`}>
      <body className="bg-[#F8FAFC] text-[#1E293B] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
