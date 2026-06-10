export const models = [
  {
    "name": "Product",
    "fields": [
      "title",
      "price",
      "inventory",
      "category",
      "rating"
    ]
  },
  {
    "name": "Order",
    "fields": [
      "items",
      "customerEmail",
      "total",
      "status"
    ]
  },
  {
    "name": "CartItem",
    "fields": [
      "productId",
      "orderId",
      "quantity",
      "price"
    ]
  }
] as const;
export const relationships = [
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

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
