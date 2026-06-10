export const interactionMap = [
  {
    "label": "Create variant 32 event",
    "type": "create",
    "target": "CrmEvent32",
    "result": "Adds event to DealPilot 32 runtime queue"
  },
  {
    "label": "Advance variant 32 state",
    "type": "transition",
    "target": "CrmRuntime32",
    "result": "Moves Queued -> Active -> Reviewed -> Done"
  },
  {
    "label": "Remove variant 32 audit",
    "type": "delete",
    "target": "CrmAudit32",
    "result": "Removes audit and dependent runtime rows"
  }
] as const;
export const relationshipMap = [
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

export function validateClientsRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
