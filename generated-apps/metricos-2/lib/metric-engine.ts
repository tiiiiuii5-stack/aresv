type RecordItem = { id: string; label: string; value: string; status: string; meta?: string; parentId?: string };

export function applyMetricsMutation(records: RecordItem[], input: Pick<RecordItem, "label" | "value" | "status">) {
  const created = { id: crypto.randomUUID?.() || String(Date.now()), ...input, meta: "create alert", parentId: records[0]?.id };
  return {
    records: [created, ...records],
    event: "create alert: " + created.label,
  };
}

export function transitionMetricsRecord(records: RecordItem[], id: string, flow: string[]) {
  let changed = "No record changed";
  const nextRecords = records.map((record) => {
    if (record.id !== id) return record;
    const index = flow.indexOf(record.status);
    const status = flow[Math.min(index + 1, flow.length - 1)] || "Done";
    changed = record.label + " moved to " + status;
    return { ...record, status };
  });
  return { records: nextRecords, event: changed };
}

export function removeMetricsRecord(records: RecordItem[], id: string) {
  const target = records.find((record) => record.id === id);
  return {
    records: records.filter((record) => record.id !== id && record.parentId !== id),
    event: target ? "Removed " + target.label : "Removed record",
  };
}
