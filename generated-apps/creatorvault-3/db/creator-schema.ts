export const models = [
  {
    "name": "Offer",
    "fields": [
      "title",
      "price",
      "tier",
      "conversionRate",
      "status"
    ]
  },
  {
    "name": "Subscriber",
    "fields": [
      "email",
      "tier",
      "lifetimeValue",
      "risk",
      "joinedAt"
    ]
  },
  {
    "name": "Purchase",
    "fields": [
      "offerId",
      "subscriberId",
      "amount",
      "status"
    ]
  }
] as const;
export const relationships = [
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

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
