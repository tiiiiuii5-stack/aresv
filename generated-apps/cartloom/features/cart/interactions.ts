export const interactionMap = [
  {
    "label": "Add to cart",
    "type": "create",
    "target": "CartItem",
    "result": "Adds product to cart and updates total"
  },
  {
    "label": "Checkout",
    "type": "transition",
    "target": "Order",
    "result": "Moves Cart -> Review -> Paid -> Fulfilled"
  },
  {
    "label": "Remove item",
    "type": "delete",
    "target": "CartItem",
    "result": "Removes item and recalculates total"
  }
] as const;
export const relationshipMap = [
  {
    "from": "Product",
    "to": "CartItem",
    "type": "one-to-many",
    "via": "productId"
  },
  {
    "from": "Order",
    "to": "CartItem",
    "type": "one-to-many",
    "via": "orderId"
  }
] as const;

export function validateCartRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
