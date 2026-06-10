export const interactionMap = [
  {
    "label": "Create variant 24 event",
    "type": "create",
    "target": "MarketplaceEvent24",
    "result": "Adds event to VendorLoop 24 runtime queue"
  },
  {
    "label": "Advance variant 24 state",
    "type": "transition",
    "target": "MarketplaceRuntime24",
    "result": "Moves Queued -> Active -> Reviewed -> Done"
  },
  {
    "label": "Remove variant 24 audit",
    "type": "delete",
    "target": "MarketplaceAudit24",
    "result": "Removes audit and dependent runtime rows"
  }
] as const;
export const relationshipMap = [
  {
    "from": "MarketplaceRuntime24",
    "to": "MarketplaceEvent24",
    "type": "one-to-many",
    "via": "marketplace-24RecordId"
  },
  {
    "from": "MarketplaceEvent24",
    "to": "MarketplaceAudit24",
    "type": "one-to-many",
    "via": "marketplace-24EventId"
  }
] as const;

export function validateInquiriesRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
