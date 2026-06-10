export const models = [
  {
    "name": "Listing",
    "fields": [
      "sellerId",
      "title",
      "price",
      "trustScore",
      "availability"
    ]
  },
  {
    "name": "Seller",
    "fields": [
      "name",
      "rating",
      "responseTime",
      "verified"
    ]
  },
  {
    "name": "Inquiry",
    "fields": [
      "listingId",
      "buyerEmail",
      "budget",
      "status"
    ]
  }
] as const;
export const relationships = [
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

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
