// Integration module: Project-Gantt
import type { GanttTask } from "./dependency-graph";

export function calculateSchedule(tasks: GanttTask[]) {
  return tasks.map((task) => {
    const start = new Date(task.start);
    const end = new Date(start);
    end.setDate(start.getDate() + task.durationDays);
    return { ...task, end: end.toISOString().slice(0, 10) };
  });
}
