export const models = [
  {
    "name": "MarketplaceRuntime24",
    "fields": [
      "marketplace-24Name",
      "marketplace-24Owner",
      "marketplace-24State",
      "marketplace-24Score"
    ]
  },
  {
    "name": "MarketplaceEvent24",
    "fields": [
      "marketplace-24RecordId",
      "marketplace-24Action",
      "marketplace-24Actor",
      "marketplace-24Result"
    ]
  },
  {
    "name": "MarketplaceAudit24",
    "fields": [
      "marketplace-24EventId",
      "marketplace-24Reviewer",
      "marketplace-24Decision",
      "marketplace-24CreatedAt"
    ]
  }
] as const;
export const relationships = [
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

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
