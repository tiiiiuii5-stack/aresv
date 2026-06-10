import { StudioBookingPlatform } from "@/components/studio-booking-platform";

export const metadata = {
  title: "Studio Booking Platform",
  description: "Role-based studio class booking with capacity, cancellation, attendance, and persistent state.",
};

export default function StudioBookingPage() {
  return <StudioBookingPlatform />;
}
