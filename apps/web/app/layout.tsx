import type { Metadata, Viewport } from "next";
import { AuthProvider } from "./contexts/auth.context";
import "./globals.css";

export const metadata: Metadata = {
  title: "VyaparNet — Bharat ka B2B Marketplace",
  description: "Verified wholesale procurement network for Bharat retailers.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#2563EB",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <html lang="hi" className="font-sans antialiased">
      <body className="bg-[#F8FAFC] text-[#1E293B] font-sans antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
