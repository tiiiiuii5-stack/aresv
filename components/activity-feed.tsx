"use client";

import Link from "next/link";
import { Clock, BarChart3, CheckCircle2, AlertCircle, Zap } from "lucide-react";
import type { Job } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

interface ActivityItem {
  id: string;
  type: "job" | "scan" | "report" | "certificate";
  title: string;
  description: string;
  status: "completed" | "failed" | "pending" | "in_progress";
  timestamp: Date;
  href?: string;
}

interface ActivityFeedProps {
  items?: ActivityItem[];
  jobs?: (Job & { project?: { title?: string } | null })[];
}

export function ActivityFeed({ items = [], jobs = [] }: ActivityFeedProps) {
  // Convert jobs to activity items
  const activityItems: ActivityItem[] = jobs
    .slice(0, 8)
    .map((job) => {
      const statusMap: Record<string, "completed" | "failed" | "pending" | "in_progress"> = {
        COMPLETED: "completed",
        FAILED: "failed",
        QUEUED: "pending",
        RUNNING: "in_progress",
        GENERATING: "in_progress",
        BUILDING: "in_progress",
        DEPLOYING: "in_progress",
        CANCELLED: "failed",
      };

      return {
        id: job.id,
        type: job.type === "scan" ? "scan" : "job",
        title: `${job.type === "generation" ? "App generated" : "Scan completed"}: ${job.project?.title || "Untitled"}`,
        description: job.currentStep || job.status,
        status: statusMap[job.status] || "pending",
        timestamp: job.completedAt || job.updatedAt,
        href: job.projectId ? `/projects/${job.projectId}` : undefined,
      };
    })
    .concat(items);

  const getIcon = (type: ActivityItem["type"]) => {
    const iconProps = { className: "h-4 w-4" };
    switch (type) {
      case "job":
        return <Zap {...iconProps} />;
      case "scan":
        return <BarChart3 {...iconProps} />;
      case "report":
        return <Clock {...iconProps} />;
      case "certificate":
        return <CheckCircle2 {...iconProps} />;
      default:
        return <Clock {...iconProps} />;
    }
  };

  const getStatusBadge = (status: ActivityItem["status"]) => {
    const variants: Record<ActivityItem["status"], string> = {
      completed: "ready",
      failed: "muted",
      pending: "outline",
      in_progress: "risky",
    };
    const labels: Record<ActivityItem["status"], string> = {
      completed: "✓ Done",
      failed: "Failed",
      pending: "Pending",
      in_progress: "Running",
    };
    return (
      <Badge variant={variants[status] as any}>{labels[status]}</Badge>
    );
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  if (activityItems.length === 0) {
    return (
      <div className="vos-panel p-5">
        <p className="vos-label">Activity</p>
        <h3 className="mt-2 vos-h3">Recent Activity</h3>
        <div className="mt-5 flex items-center justify-center rounded-lg border border-dashed border-slate-700 py-8">
          <p className="text-center text-sm font-semibold text-[rgb(var(--vos-text-muted))]">
            No activity yet. Start a scan to see activity here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="vos-panel p-5">
      <p className="vos-label">Activity</p>
      <h3 className="mt-2 vos-h3">Recent Activity</h3>
      <div className="mt-5 space-y-3">
        {activityItems.map((item) => (
          <Link
            key={item.id}
            href={item.href || "#"}
            className={`vos-cell flex items-start gap-3 p-3 transition ${
              item.href ? "hover:border-[rgb(var(--vos-border-strong))] hover:shadow-lg hover:shadow-slate-950/30 hover:-translate-y-0.5 cursor-pointer" : ""
            }`}
          >
            <div className="mt-1 flex-shrink-0 rounded-full bg-slate-800/50 p-2 text-[rgb(var(--vos-accent))]">
              {getIcon(item.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[rgb(var(--vos-text))] truncate">
                {item.title}
              </p>
              <p className="mt-1 text-xs font-semibold text-[rgb(var(--vos-text-muted))]">
                {formatTime(item.timestamp)}
              </p>
            </div>
            <div className="flex-shrink-0">
              {getStatusBadge(item.status)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
