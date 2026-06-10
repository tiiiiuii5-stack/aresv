import "./globals.css";

export const metadata = {
  title: "DealPilot 32",
  description: "Build isolated local test CRM for sales managers where users create clients, move deals, assign tasks, and save activity history. unique architecture variant 32",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
