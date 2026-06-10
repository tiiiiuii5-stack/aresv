import "./globals.css";

export const metadata = {
  title: "PromptDesk 427",
  description: "Build a booking calendar for clinic admins, providers, and patients. Real users: clinic admin, provider, patient. Real actions: create availability slots, book appointments, generate ICS invites, sync Google Calendar, parse recurring availability rules, cancel appointments. Real data: users, providers, slots, appointments, recurring rules, calendar sync events. Real state changes: booking reduces availability, cancellation restores slot, sync marks provider event id, refresh keeps saved state. unique architecture variant 427",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
