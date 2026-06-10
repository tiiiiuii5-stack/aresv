import { applyInquiriesMutation, removeInquiriesRecord, transitionInquiriesRecord } from "@/lib/market-engine";

export const statusFlow = [
  "Queued",
  "Active",
  "Healthy",
  "In Progress",
  "Done"
] as const;

export function handleInquiriesAction(records: Array<{ id: string; label: string; value: string; status: string; meta?: string; parentId?: string }>, body: { action?: string; id?: string; label?: string; value?: string; status?: string }) {
  if (body.action === "transition" && body.id) return transitionInquiriesRecord(records, body.id, [...statusFlow]);
  if (body.action === "delete" && body.id) return removeInquiriesRecord(records, body.id);
  return applyInquiriesMutation(records, { label: body.label || "Create marketplace event", value: body.value || "New", status: body.status || statusFlow[0] || "Created" });
}
