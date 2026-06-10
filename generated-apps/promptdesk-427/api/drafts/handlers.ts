import { applyDraftsMutation, removeDraftsRecord, transitionDraftsRecord } from "@/lib/content-engine";

export const statusFlow = [
  "Queued",
  "Active",
  "Healthy",
  "In Progress",
  "Done"
] as const;

export function handleDraftsAction(records: Array<{ id: string; label: string; value: string; status: string; meta?: string; parentId?: string }>, body: { action?: string; id?: string; label?: string; value?: string; status?: string }) {
  if (body.action === "transition" && body.id) return transitionDraftsRecord(records, body.id, [...statusFlow]);
  if (body.action === "delete" && body.id) return removeDraftsRecord(records, body.id);
  return applyDraftsMutation(records, { label: body.label || "Create ai-content event", value: body.value || "New", status: body.status || statusFlow[0] || "Created" });
}
