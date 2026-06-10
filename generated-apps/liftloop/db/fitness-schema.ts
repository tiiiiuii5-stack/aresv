export const models = [
  {
    "name": "Workout",
    "fields": [
      "title",
      "sets",
      "duration",
      "intensity",
      "completedAt"
    ]
  },
  {
    "name": "Habit",
    "fields": [
      "name",
      "streak",
      "target",
      "status"
    ]
  },
  {
    "name": "CheckIn",
    "fields": [
      "workoutId",
      "habitId",
      "effort",
      "notes",
      "createdAt"
    ]
  }
] as const;
export const relationships = [
  {
    "from": "Workout",
    "to": "CheckIn",
    "type": "one-to-many",
    "via": "workoutId"
  },
  {
    "from": "Habit",
    "to": "CheckIn",
    "type": "one-to-many",
    "via": "habitId"
  }
] as const;

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
