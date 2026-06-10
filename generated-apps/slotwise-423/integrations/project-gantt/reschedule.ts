// Integration module: Project-Gantt
export function rescheduleTask(start: string, deltaDays: number) {
  const date = new Date(start);
  date.setDate(date.getDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}
