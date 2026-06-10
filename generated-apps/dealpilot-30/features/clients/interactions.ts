export const interactionMap = [
  {
    "label": "Create variant 30 event",
    "type": "create",
    "target": "CrmEvent30",
    "result": "Adds event to DealPilot 30 runtime queue"
  },
  {
    "label": "Advance variant 30 state",
    "type": "transition",
    "target": "CrmRuntime30",
    "result": "Moves Queued -> Active -> Reviewed -> Done"
  },
  {
    "label": "Remove variant 30 audit",
    "type": "delete",
    "target": "CrmAudit30",
    "result": "Removes audit and dependent runtime rows"
  }
] as const;
export const relationshipMap = [
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

export function validateClientsRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
