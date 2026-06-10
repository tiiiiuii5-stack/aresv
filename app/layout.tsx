import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { ToastViewport } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

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
      <body className={`${inter.variable} ${spaceGrotesk.variable}`}>
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}
