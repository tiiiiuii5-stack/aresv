import { applyOffersMutation, removeOffersRecord, transitionOffersRecord } from "@/lib/creator-engine";

export const statusFlow = [
  "Growing",
  "Launching",
  "Limited",
  "In Progress",
  "Done"
] as const;

export function handleOffersAction(records: Array<{ id: string; label: string; value: string; status: string; meta?: string; parentId?: string }>, body: { action?: string; id?: string; label?: string; value?: string; status?: string }) {
  if (body.action === "transition" && body.id) return transitionOffersRecord(records, body.id, [...statusFlow]);
  if (body.action === "delete" && body.id) return removeOffersRecord(records, body.id);
  return applyOffersMutation(records, { label: body.label || "New offer", value: body.value || "New", status: body.status || statusFlow[0] || "Created" });
}
