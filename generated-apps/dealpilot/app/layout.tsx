import "./globals.css";

export const metadata = {
  title: "DealPilot",
  description: "Build a CRM system for client pipelines, projects, tasks, revenue stages, and account follow-up.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
