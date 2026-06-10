export const models = [
  {
    "name": "MenuItem",
    "fields": [
      "name",
      "price",
      "station",
      "available",
      "prepTime"
    ]
  },
  {
    "name": "KitchenTicket",
    "fields": [
      "items",
      "customerName",
      "status",
      "pickupTime"
    ]
  },
  {
    "name": "OrderLine",
    "fields": [
      "ticketId",
      "menuItemId",
      "quantity",
      "notes"
    ]
  }
] as const;
export const relationships = [
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

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
