export const interactionMap = [
  {
    "label": "Create variant 31 event",
    "type": "create",
    "target": "CrmEvent31",
    "result": "Adds event to DealPilot 31 runtime queue"
  },
  {
    "label": "Advance variant 31 state",
    "type": "transition",
    "target": "CrmRuntime31",
    "result": "Moves Queued -> Active -> Reviewed -> Done"
  },
  {
    "label": "Remove variant 31 audit",
    "type": "delete",
    "target": "CrmAudit31",
    "result": "Removes audit and dependent runtime rows"
  }
] as const;
export const relationshipMap = [
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

export function validateClientsRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
