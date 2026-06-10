import "./globals.css";

export const metadata = {
  title: "MetricOS",
  description: "Build a SaaS analytics dashboard with metrics, alerts, cohorts, funnels, and retention workflows.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
