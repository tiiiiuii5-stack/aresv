import "./globals.css";

export const metadata = {
  title: "SlotWise",
  description: "Build a booking platform with staff calendars, availability slots, customer bookings, and admin approvals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
