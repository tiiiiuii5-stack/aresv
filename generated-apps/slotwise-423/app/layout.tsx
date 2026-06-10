import "./globals.css";

export const metadata = {
  title: "SlotWise 423",
  description: "Build a project Gantt planning app for project managers, contributors, and executives. Real users: project manager, contributor, executive. Real actions: create tasks, define dependency graph, calculate dates, render Gantt timeline, drag tasks to reschedule, update dependent milestones, and export plan. Real data: users, projects, tasks, dependencies, milestones, schedule changes. Real state changes: dependency edits recalculate schedule, dragging changes task dates, milestone status persists, refresh keeps saved state. unique architecture variant 423",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
