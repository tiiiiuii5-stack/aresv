import { applyBookingsMutation, removeBookingsRecord, transitionBookingsRecord } from "@/lib/availability-engine";

export const statusFlow = [
  "Requested",
  "Confirmed",
  "Completed"
] as const;

export function handleBookingsAction(records: Array<{ id: string; label: string; value: string; status: string; meta?: string; parentId?: string }>, body: { action?: string; id?: string; label?: string; value?: string; status?: string }) {
  if (body.action === "transition" && body.id) return transitionBookingsRecord(records, body.id, [...statusFlow]);
  if (body.action === "delete" && body.id) return removeBookingsRecord(records, body.id);
  return applyBookingsMutation(records, { label: body.label || "Booking request", value: body.value || "New", status: body.status || statusFlow[0] || "Created" });
}
