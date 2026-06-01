import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VyaparNet Admin — Platform Governance',
  description: 'VyaparNet admin panel for KYC, product approval, orders, and platform governance.',
};

export const viewport: Viewport = {
  themeColor: '#1E293B',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="en">
      <body className="bg-[#F8FAFC] text-[#1E293B] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
