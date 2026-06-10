export const models = [
  {
    "name": "AiContentRuntime427",
    "fields": [
      "ai-content-427Name",
      "ai-content-427Owner",
      "ai-content-427State",
      "ai-content-427Score"
    ]
  },
  {
    "name": "AiContentEvent427",
    "fields": [
      "ai-content-427RecordId",
      "ai-content-427Action",
      "ai-content-427Actor",
      "ai-content-427Result"
    ]
  },
  {
    "name": "AiContentAudit427",
    "fields": [
      "ai-content-427EventId",
      "ai-content-427Reviewer",
      "ai-content-427Decision",
      "ai-content-427CreatedAt"
    ]
  }
] as const;
export const relationships = [
  {
    "from": "AiContentRuntime427",
    "to": "AiContentEvent427",
    "type": "one-to-many",
    "via": "ai-content-427RecordId"
  },
  {
    "from": "AiContentEvent427",
    "to": "AiContentAudit427",
    "type": "one-to-many",
    "via": "ai-content-427EventId"
  }
] as const;

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
