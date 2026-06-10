import { applyClientsMutation, removeClientsRecord, transitionClientsRecord } from "@/lib/pipeline-engine";

export const statusFlow = [
  "Lead",
  "In Progress",
  "Review",
  "Done"
] as const;

export function handleClientsAction(records: Array<{ id: string; label: string; value: string; status: string; meta?: string; parentId?: string }>, body: { action?: string; id?: string; label?: string; value?: string; status?: string }) {
  if (body.action === "transition" && body.id) return transitionClientsRecord(records, body.id, [...statusFlow]);
  if (body.action === "delete" && body.id) return removeClientsRecord(records, body.id);
  return applyClientsMutation(records, { label: body.label || "New deal", value: body.value || "New", status: body.status || statusFlow[0] || "Created" });
}
