export const models = [
  {
    "name": "CrmRuntime30",
    "fields": [
      "crm-30Name",
      "crm-30Owner",
      "crm-30State",
      "crm-30Score"
    ]
  },
  {
    "name": "CrmEvent30",
    "fields": [
      "crm-30RecordId",
      "crm-30Action",
      "crm-30Actor",
      "crm-30Result"
    ]
  },
  {
    "name": "CrmAudit30",
    "fields": [
      "crm-30EventId",
      "crm-30Reviewer",
      "crm-30Decision",
      "crm-30CreatedAt"
    ]
  }
] as const;
export const relationships = [
  {
    "from": "CrmRuntime30",
    "to": "CrmEvent30",
    "type": "one-to-many",
    "via": "crm-30RecordId"
  },
  {
    "from": "CrmEvent30",
    "to": "CrmAudit30",
    "type": "one-to-many",
    "via": "crm-30EventId"
  }
] as const;

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
