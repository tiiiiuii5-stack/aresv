import "./globals.css";

export const metadata = {
  title: "DealPilot 30",
  description: "Build preflight CRM for sales managers where users create clients, move deals, assign tasks, and save activity history. unique architecture variant 30",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
