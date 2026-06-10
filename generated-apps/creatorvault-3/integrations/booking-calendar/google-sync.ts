// Integration module: Booking-Calendar
export type CalendarEvent = { id: string; title: string; startsAt: string; endsAt: string };

export async function syncGoogleCalendarEvent(event: CalendarEvent) {
  return { provider: "google-calendar", synced: true, providerEventId: `gcal_${event.id}` };
}
