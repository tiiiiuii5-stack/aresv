import "./globals.css";

export const metadata = {
  title: "MetricOS",
  description: "Build an analytics app with metrics, alerts, cohorts, state transitions, backend events, and async alert jobs 1780202672284.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
