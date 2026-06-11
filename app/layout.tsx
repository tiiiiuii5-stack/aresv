import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ToastViewport } from "@/components/ui/toast";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const criticalCss = `
:root{color-scheme:dark;--vos-surface:9 11 15;--vos-panel:13 18 28;--vos-panel-raised:18 24 37;--vos-border:45 55 72;--vos-border-strong:71 85 105;--vos-text:248 250 252;--vos-text-muted:203 213 225;--vos-text-subtle:148 163 184;--vos-primary:45 212 191;--vos-primary-text:4 15 14;--vos-verified:34 197 94;--vos-verified-bg:6 78 59;--vos-risk:245 158 11;--vos-risk-bg:69 42 9;--vos-danger:248 113 113;--vos-danger-bg:69 10 10}
*{box-sizing:border-box}
html{background:#090b0f;color:rgb(var(--vos-text));font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{min-height:100vh;margin:0;background:radial-gradient(circle at 12% 8%,rgb(45 212 191/.14),transparent 32rem),radial-gradient(circle at 88% 2%,rgb(59 130 246/.14),transparent 28rem),linear-gradient(180deg,#0b0f19,#03060c);color:rgb(var(--vos-text));font-family:var(--font-inter),Inter,ui-sans-serif,system-ui,sans-serif}
a{color:inherit;text-decoration:none}
main{min-height:100vh;color:rgb(var(--vos-text))}
h1,h2,h3,p{margin:0}
h1,.vos-h1{font-size:clamp(2.25rem,5vw,4.75rem);line-height:1.04;font-weight:900;color:rgb(var(--vos-text))}
h2,.vos-h2{font-size:clamp(1.5rem,3vw,2.5rem);line-height:1.08;font-weight:850;color:rgb(var(--vos-text))}
p,.vos-body{line-height:1.65;color:rgb(var(--vos-text-muted))}
input,textarea,select,button{font:inherit}
button,a[href]{transition:transform .18s ease,border-color .18s ease,background .18s ease,box-shadow .18s ease}
button:hover,a[href]:hover{transform:translateY(-1px)}
button:active,a[href]:active{transform:translateY(1px) scale(.99)}
.vos-page{background:transparent;isolation:isolate}
.vos-hero-bg{background:linear-gradient(135deg,rgb(8 13 22/.88),rgb(6 10 18/.72))}
.vos-panel,.vos-buyer-card,.vos-cell{border:1px solid rgb(var(--vos-border));background:linear-gradient(180deg,rgb(var(--vos-panel-raised)/.82),rgb(var(--vos-panel)/.96));box-shadow:0 18px 50px rgb(0 0 0/.24),inset 0 1px 0 rgb(255 255 255/.03);border-radius:.75rem}
.vos-cell{background:rgb(var(--vos-panel-raised)/.84)}
.vos-button,.action,.nav{display:inline-flex;min-height:2.75rem;align-items:center;justify-content:center;gap:.5rem;border:1px solid rgb(var(--vos-border));border-radius:.65rem;background:rgb(var(--vos-panel-raised));color:rgb(var(--vos-text));padding:.65rem 1rem;font-weight:850;box-shadow:0 8px 18px rgb(0 0 0/.18)}
.vos-button-default,.action.primary,.nav-active,.nav[aria-current=page]{border-color:rgb(var(--vos-primary));background:linear-gradient(180deg,rgb(var(--vos-primary)),rgb(20 184 166));color:rgb(var(--vos-primary-text));box-shadow:0 14px 30px rgb(var(--vos-primary)/.22)}
.vos-button-outline,.vos-button-secondary,.nav{background:rgb(var(--vos-panel-raised)/.9);color:rgb(var(--vos-text))}
.vos-button-sm{min-height:2.35rem;padding:.5rem .8rem;font-size:.875rem}
.vos-button-lg{min-height:3.25rem;padding:.8rem 1.35rem;font-size:1rem}
.vos-button-icon{width:2.5rem;padding:0}
.vos-button:hover,.action:hover,.nav:hover{border-color:rgb(var(--vos-border-strong));box-shadow:0 16px 32px rgb(0 0 0/.28)}
.vos-badge{display:inline-flex;align-items:center;border:1px solid rgb(var(--vos-border));border-radius:999px;background:rgb(var(--vos-panel-raised));padding:.25rem .65rem;font-size:.75rem;font-weight:900;color:rgb(var(--vos-text-muted))}
.vos-badge-ready{border-color:rgb(var(--vos-verified)/.55);background:rgb(var(--vos-verified-bg)/.55);color:#bbf7d0}
.vos-badge-risky{border-color:rgb(var(--vos-risk)/.55);background:rgb(var(--vos-risk-bg)/.55);color:#fde68a}
.vos-badge-blocked{border-color:rgb(var(--vos-danger)/.55);background:rgb(var(--vos-danger-bg)/.55);color:#fecaca}
.vos-label{font-size:.75rem;font-weight:900;text-transform:uppercase;color:rgb(var(--vos-text-subtle))}
.vos-card-title{font-size:1.45rem;line-height:1.1;font-weight:900;color:rgb(var(--vos-text))}
.vos-table{width:100%;border-collapse:collapse;overflow:hidden;border-radius:.75rem}
.vos-table th,.vos-table td{border-bottom:1px solid rgb(var(--vos-border));padding:.75rem}
.print-hide{background:rgb(var(--vos-surface)/.94);backdrop-filter:blur(12px)}
`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://ventureos-intelligence-layer.vercel.app"),
  title: "VentureOS Software Intelligence",
  description: "Evidence-scoped software reviews, signed evidence receipts, SBOM summaries, immutable evidence packs, and technical diligence records.",
  alternates: {
    canonical: "/",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style id="ventureos-critical-css" dangerouslySetInnerHTML={{ __html: criticalCss }} />
      </head>
      <body className={`${inter.variable} ${jetBrainsMono.variable}`}>
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}
