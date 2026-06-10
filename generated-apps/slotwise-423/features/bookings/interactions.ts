export const interactionMap = [
  {
    "label": "Create variant 423 event",
    "type": "create",
    "target": "BookingEvent423",
    "result": "Adds event to SlotWise 423 runtime queue"
  },
  {
    "label": "Advance variant 423 state",
    "type": "transition",
    "target": "BookingRuntime423",
    "result": "Moves Queued -> Active -> Reviewed -> Done"
  },
  {
    "label": "Remove variant 423 audit",
    "type": "delete",
    "target": "BookingAudit423",
    "result": "Removes audit and dependent runtime rows"
  }
] as const;
export const relationshipMap = [
  {
    "from": "BookingRuntime423",
    "to": "BookingEvent423",
    "type": "one-to-many",
    "via": "booking-423RecordId"
  },
  {
    "from": "BookingEvent423",
    "to": "BookingAudit423",
    "type": "one-to-many",
    "via": "booking-423EventId"
  }
] as const;

export function validateBookingsRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
