export const models = [
  {
    "name": "Slot",
    "fields": [
      "startsAt",
      "endsAt",
      "capacity",
      "status"
    ]
  },
  {
    "name": "Booking",
    "fields": [
      "slotId",
      "customerName",
      "email",
      "status",
      "notes"
    ]
  },
  {
    "name": "StaffMember",
    "fields": [
      "name",
      "role",
      "timezone",
      "active"
    ]
  }
] as const;
export const relationships = [
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

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
