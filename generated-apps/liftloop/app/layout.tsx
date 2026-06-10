import "./globals.css";

export const metadata = {
  title: "LiftLoop",
  description: "Build a fitness tracker with workouts, habits, check-ins, streaks, and coach review.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
