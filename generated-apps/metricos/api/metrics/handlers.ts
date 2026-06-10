import { applyMetricsMutation, removeMetricsRecord, transitionMetricsRecord } from "@/lib/metric-engine";

export const statusFlow = [
  "Open",
  "Investigating",
  "Resolved"
] as const;

export function handleMetricsAction(records: Array<{ id: string; label: string; value: string; status: string; meta?: string; parentId?: string }>, body: { action?: string; id?: string; label?: string; value?: string; status?: string }) {
  if (body.action === "transition" && body.id) return transitionMetricsRecord(records, body.id, [...statusFlow]);
  if (body.action === "delete" && body.id) return removeMetricsRecord(records, body.id);
  return applyMetricsMutation(records, { label: body.label || "Create alert", value: body.value || "New", status: body.status || statusFlow[0] || "Created" });
}
