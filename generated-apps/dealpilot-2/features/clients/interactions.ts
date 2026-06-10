export const interactionMap = [
  {
    "label": "Create deal",
    "type": "create",
    "target": "Deal",
    "result": "Adds a deal to the first pipeline stage"
  },
  {
    "label": "Advance stage",
    "type": "transition",
    "target": "Deal",
    "result": "Moves Lead -> In Progress -> Review -> Done"
  },
  {
    "label": "Delete task",
    "type": "delete",
    "target": "Task",
    "result": "Removes completed task from the deal"
  }
] as const;
export const relationshipMap = [
  {
    "from": "Client",
    "to": "Deal",
    "type": "one-to-many",
    "via": "clientId"
  },
  {
    "from": "Deal",
    "to": "Task",
    "type": "one-to-many",
    "via": "dealId"
  }
] as const;

export function validateClientsRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
