import type { Metadata } from "next";
import { ToastViewport } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://ventureos-intelligence-layer.vercel.app"),
  title: "VentureOS Software Intelligence",
  description: "Verified software evidence reports, Signed Verification Badges, immutable evidence packs, and technical diligence records.",
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}
