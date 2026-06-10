export const interactionMap = [
  {
    "label": "Log workout",
    "type": "create",
    "target": "CheckIn",
    "result": "Adds workout check-in and updates streak"
  },
  {
    "label": "Complete habit",
    "type": "transition",
    "target": "Habit",
    "result": "Moves Planned -> Complete and increases streak"
  },
  {
    "label": "Remove check-in",
    "type": "delete",
    "target": "CheckIn",
    "result": "Removes mistaken entry"
  }
] as const;
export const relationshipMap = [
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

export function validateCheckinsRelationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
