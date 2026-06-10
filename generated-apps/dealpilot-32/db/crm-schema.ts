export const models = [
  {
    "name": "CrmRuntime32",
    "fields": [
      "crm-32Name",
      "crm-32Owner",
      "crm-32State",
      "crm-32Score"
    ]
  },
  {
    "name": "CrmEvent32",
    "fields": [
      "crm-32RecordId",
      "crm-32Action",
      "crm-32Actor",
      "crm-32Result"
    ]
  },
  {
    "name": "CrmAudit32",
    "fields": [
      "crm-32EventId",
      "crm-32Reviewer",
      "crm-32Decision",
      "crm-32CreatedAt"
    ]
  }
] as const;
export const relationships = [
  {
    "from": "CrmRuntime32",
    "to": "CrmEvent32",
    "type": "one-to-many",
    "via": "crm-32RecordId"
  },
  {
    "from": "CrmEvent32",
    "to": "CrmAudit32",
    "type": "one-to-many",
    "via": "crm-32EventId"
  }
] as const;

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
