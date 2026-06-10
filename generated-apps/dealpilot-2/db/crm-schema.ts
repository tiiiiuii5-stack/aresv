export const models = [
  {
    "name": "Client",
    "fields": [
      "name",
      "owner",
      "health",
      "renewalDate",
      "notes"
    ]
  },
  {
    "name": "Deal",
    "fields": [
      "clientId",
      "stage",
      "value",
      "probability",
      "nextStep"
    ]
  },
  {
    "name": "Task",
    "fields": [
      "dealId",
      "title",
      "status",
      "createdAt",
      "completedAt"
    ]
  }
] as const;
export const relationships = [
  {
    "from": "Client",
    "to": "Deal",
    "type": "one-to-many",
    "via": "clientId"
  },
  {
    "from": "Deal",
    "to": "Task",
    "type": "one-to-many",
    "via": "dealId"
  }
] as const;

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
