import { applyCheckinsMutation, removeCheckinsRecord, transitionCheckinsRecord } from "@/lib/training-engine";

export const statusFlow = [
  "Planned",
  "Complete",
  "Reviewed"
] as const;

export function handleCheckinsAction(records: Array<{ id: string; label: string; value: string; status: string; meta?: string; parentId?: string }>, body: { action?: string; id?: string; label?: string; value?: string; status?: string }) {
  if (body.action === "transition" && body.id) return transitionCheckinsRecord(records, body.id, [...statusFlow]);
  if (body.action === "delete" && body.id) return removeCheckinsRecord(records, body.id);
  return applyCheckinsMutation(records, { label: body.label || "Workout check-in", value: body.value || "New", status: body.status || statusFlow[0] || "Created" });
}
