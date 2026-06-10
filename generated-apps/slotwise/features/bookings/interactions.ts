export const interactionMap = [
  {
    "label": "Request booking",
    "type": "create",
    "target": "Booking",
    "result": "Adds booking request to admin queue"
  },
  {
    "label": "Confirm booking",
    "type": "transition",
    "target": "Booking",
    "result": "Moves Requested -> Confirmed -> Completed"
  },
  {
    "label": "Cancel booking",
    "type": "delete",
    "target": "Booking",
    "result": "Frees slot capacity"
  }
] as const;
export const relationshipMap = [
  {
    "from": "StaffMember",
    "to": "Slot",
    "type": "one-to-many",
    "via": "staffMemberId"
  },
  {
    "from": "Slot",
    "to": "Booking",
    "type": "one-to-many",
    "via": "slotId"
  }
] as const;

export function validateBookingsRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
