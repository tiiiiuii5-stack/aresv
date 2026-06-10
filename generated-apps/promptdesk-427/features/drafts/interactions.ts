export const interactionMap = [
  {
    "label": "Create variant 427 event",
    "type": "create",
    "target": "AiContentEvent427",
    "result": "Adds event to PromptDesk 427 runtime queue"
  },
  {
    "label": "Advance variant 427 state",
    "type": "transition",
    "target": "AiContentRuntime427",
    "result": "Moves Queued -> Active -> Reviewed -> Done"
  },
  {
    "label": "Remove variant 427 audit",
    "type": "delete",
    "target": "AiContentAudit427",
    "result": "Removes audit and dependent runtime rows"
  }
] as const;
export const relationshipMap = [
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

export function validateDraftsRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
