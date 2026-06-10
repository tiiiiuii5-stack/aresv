export const interactionMap = [
  {
    "label": "Launch offer",
    "type": "create",
    "target": "Offer",
    "result": "Adds paid offer to launch board"
  },
  {
    "label": "Convert subscriber",
    "type": "transition",
    "target": "Purchase",
    "result": "Moves Interested -> Purchased -> Retained"
  },
  {
    "label": "Cancel subscriber",
    "type": "delete",
    "target": "Subscriber",
    "result": "Marks subscriber inactive"
  }
] as const;
export const relationshipMap = [
  {
    "from": "Offer",
    "to": "Purchase",
    "type": "one-to-many",
    "via": "offerId"
  },
  {
    "from": "Subscriber",
    "to": "Purchase",
    "type": "one-to-many",
    "via": "subscriberId"
  }
] as const;

export function validateOffersRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
