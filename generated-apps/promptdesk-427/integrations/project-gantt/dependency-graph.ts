// Integration module: Project-Gantt
export type GanttTask = { id: string; title: string; start: string; durationDays: number; dependsOn: string[] };

export function topologicalTaskOrder(tasks: GanttTask[]) {
  const visited = new Set<string>();
  const ordered: GanttTask[] = [];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  function visit(task: GanttTask) {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    for (const dependency of task.dependsOn) {
      const parent = byId.get(dependency);
      if (parent) visit(parent);
    }
    ordered.push(task);
  }
  tasks.forEach(visit);
  return ordered;
}
