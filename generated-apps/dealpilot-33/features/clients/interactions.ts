export const interactionMap = [
  {
    "label": "Create variant 33 event",
    "type": "create",
    "target": "CrmEvent33",
    "result": "Adds event to DealPilot 33 runtime queue"
  },
  {
    "label": "Advance variant 33 state",
    "type": "transition",
    "target": "CrmRuntime33",
    "result": "Moves Queued -> Active -> Reviewed -> Done"
  },
  {
    "label": "Remove variant 33 audit",
    "type": "delete",
    "target": "CrmAudit33",
    "result": "Removes audit and dependent runtime rows"
  }
] as const;
export const relationshipMap = [
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

export function validateClientsRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
