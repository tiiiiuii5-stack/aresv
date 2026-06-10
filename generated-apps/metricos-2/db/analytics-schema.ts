export const models = [
  {
    "name": "Metric",
    "fields": [
      "name",
      "value",
      "delta",
      "segment",
      "period"
    ]
  },
  {
    "name": "Alert",
    "fields": [
      "metricId",
      "severity",
      "message",
      "owner"
    ]
  },
  {
    "name": "Cohort",
    "fields": [
      "metricId",
      "name",
      "period",
      "retention"
    ]
  }
] as const;
export const relationships = [
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

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
