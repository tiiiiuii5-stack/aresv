export const models = [
  {
    "name": "BookingRuntime423",
    "fields": [
      "booking-423Name",
      "booking-423Owner",
      "booking-423State",
      "booking-423Score"
    ]
  },
  {
    "name": "BookingEvent423",
    "fields": [
      "booking-423RecordId",
      "booking-423Action",
      "booking-423Actor",
      "booking-423Result"
    ]
  },
  {
    "name": "BookingAudit423",
    "fields": [
      "booking-423EventId",
      "booking-423Reviewer",
      "booking-423Decision",
      "booking-423CreatedAt"
    ]
  }
] as const;
export const relationships = [
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

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
