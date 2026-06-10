// Integration module: Booking-Calendar
export function parseWeeklyRule(rule: string) {
  const intervalMatch = rule.match(/INTERVAL=(\d+)/);
  const byDayMatch = rule.match(/BYDAY=([^;]+)/);
  return {
    frequency: rule.includes("FREQ=WEEKLY") ? "weekly" : "custom",
    interval: intervalMatch ? Number(intervalMatch[1]) : 1,
    days: byDayMatch ? byDayMatch[1].split(",") : [],
  };
}
