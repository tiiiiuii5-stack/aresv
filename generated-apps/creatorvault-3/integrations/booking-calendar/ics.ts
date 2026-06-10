// Integration module: Booking-Calendar
export function icsEvent(input: { uid: string; title: string; startsAt: string; endsAt: string }) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `UID:${input.uid}`, `SUMMARY:${input.title}`, `DTSTART:${formatIcsDate(input.startsAt)}`, `DTEND:${formatIcsDate(input.endsAt)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

function formatIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(".000", "");
}
