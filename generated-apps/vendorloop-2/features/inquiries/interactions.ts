export const interactionMap = [
  {
    "label": "Send inquiry",
    "type": "create",
    "target": "Inquiry",
    "result": "Adds buyer inquiry to seller queue"
  },
  {
    "label": "Qualify inquiry",
    "type": "transition",
    "target": "Inquiry",
    "result": "Moves New -> Qualified -> Closed"
  },
  {
    "label": "Remove listing",
    "type": "delete",
    "target": "Listing",
    "result": "Archives listing from marketplace"
  }
] as const;
export const relationshipMap = [
  {
    "from": "Seller",
    "to": "Listing",
    "type": "one-to-many",
    "via": "sellerId"
  },
  {
    "from": "Listing",
    "to": "Inquiry",
    "type": "one-to-many",
    "via": "listingId"
  }
] as const;

export function validateInquiriesRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
