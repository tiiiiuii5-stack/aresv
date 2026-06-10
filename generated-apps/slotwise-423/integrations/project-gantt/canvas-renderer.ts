// Integration module: Project-Gantt
export function ganttBar(task: { id: string; title: string }, x: number, y: number, width: number) {
  return `<g data-task="${task.id}"><rect x="${x}" y="${y}" width="${width}" height="28" rx="6" /><text x="${x + 8}" y="${y + 19}">${task.title}</text></g>`;
}
