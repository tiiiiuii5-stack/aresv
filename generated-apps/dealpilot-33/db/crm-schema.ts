export const models = [
  {
    "name": "CrmRuntime33",
    "fields": [
      "crm-33Name",
      "crm-33Owner",
      "crm-33State",
      "crm-33Score"
    ]
  },
  {
    "name": "CrmEvent33",
    "fields": [
      "crm-33RecordId",
      "crm-33Action",
      "crm-33Actor",
      "crm-33Result"
    ]
  },
  {
    "name": "CrmAudit33",
    "fields": [
      "crm-33EventId",
      "crm-33Reviewer",
      "crm-33Decision",
      "crm-33CreatedAt"
    ]
  }
] as const;
export const relationships = [
  {
    "from": "CrmRuntime33",
    "to": "CrmEvent33",
    "type": "one-to-many",
    "via": "crm-33RecordId"
  },
  {
    "from": "CrmEvent33",
    "to": "CrmAudit33",
    "type": "one-to-many",
    "via": "crm-33EventId"
  }
] as const;

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
