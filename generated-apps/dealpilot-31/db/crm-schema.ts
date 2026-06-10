export const models = [
  {
    "name": "CrmRuntime31",
    "fields": [
      "crm-31Name",
      "crm-31Owner",
      "crm-31State",
      "crm-31Score"
    ]
  },
  {
    "name": "CrmEvent31",
    "fields": [
      "crm-31RecordId",
      "crm-31Action",
      "crm-31Actor",
      "crm-31Result"
    ]
  },
  {
    "name": "CrmAudit31",
    "fields": [
      "crm-31EventId",
      "crm-31Reviewer",
      "crm-31Decision",
      "crm-31CreatedAt"
    ]
  }
] as const;
export const relationships = [
  {
    "from": "CrmRuntime31",
    "to": "CrmEvent31",
    "type": "one-to-many",
    "via": "crm-31RecordId"
  },
  {
    "from": "CrmEvent31",
    "to": "CrmAudit31",
    "type": "one-to-many",
    "via": "crm-31EventId"
  }
] as const;

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
