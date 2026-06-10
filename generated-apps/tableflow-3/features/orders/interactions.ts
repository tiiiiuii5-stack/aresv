export const interactionMap = [
  {
    "label": "Send order",
    "type": "create",
    "target": "KitchenTicket",
    "result": "Adds order to kitchen queue"
  },
  {
    "label": "Advance prep",
    "type": "transition",
    "target": "KitchenTicket",
    "result": "Moves New -> Prep -> Ready -> Picked up"
  },
  {
    "label": "Remove line",
    "type": "delete",
    "target": "OrderLine",
    "result": "Removes item from order"
  }
] as const;
export const relationshipMap = [
  {
    "from": "KitchenTicket",
    "to": "OrderLine",
    "type": "one-to-many",
    "via": "ticketId"
  },
  {
    "from": "MenuItem",
    "to": "OrderLine",
    "type": "one-to-many",
    "via": "menuItemId"
  }
] as const;

export function validateOrdersRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
