import { applyOrdersMutation, removeOrdersRecord, transitionOrdersRecord } from "@/lib/kitchen-engine";

export const statusFlow = [
  "Hot station",
  "Ready fast",
  "Popular",
  "In Progress",
  "Done"
] as const;

export function handleOrdersAction(records: Array<{ id: string; label: string; value: string; status: string; meta?: string; parentId?: string }>, body: { action?: string; id?: string; label?: string; value?: string; status?: string }) {
  if (body.action === "transition" && body.id) return transitionOrdersRecord(records, body.id, [...statusFlow]);
  if (body.action === "delete" && body.id) return removeOrdersRecord(records, body.id);
  return applyOrdersMutation(records, { label: body.label || "Order item", value: body.value || "New", status: body.status || statusFlow[0] || "Created" });
}
