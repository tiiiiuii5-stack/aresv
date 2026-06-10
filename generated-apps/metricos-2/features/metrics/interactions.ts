export const interactionMap = [
  {
    "label": "Create alert",
    "type": "create",
    "target": "Alert",
    "result": "Adds metric alert to owner queue"
  },
  {
    "label": "Resolve alert",
    "type": "transition",
    "target": "Alert",
    "result": "Moves Open -> Investigating -> Resolved"
  },
  {
    "label": "Delete cohort",
    "type": "delete",
    "target": "Cohort",
    "result": "Removes stale cohort analysis"
  }
] as const;
export const relationshipMap = [
  {
    "from": "Metric",
    "to": "Alert",
    "type": "one-to-many",
    "via": "metricId"
  },
  {
    "from": "Metric",
    "to": "Cohort",
    "type": "one-to-many",
    "via": "metricId"
  }
] as const;

export function validateMetricsRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
