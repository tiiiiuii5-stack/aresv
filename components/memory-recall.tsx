"use client";

import { Bot } from "lucide-react";

export function MemoryRecall({ memories, loading }: { memories: Array<{ id: string; memoryType: string; content: string; similarity?: number }>; loading?: boolean }) {
  return (
    <section className="vos-panel p-5">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-[rgb(var(--vos-primary))]" />
        <h2 className="vos-h2">Agent Memory</h2>
      </div>
      <div className="mt-4 space-y-3">
        {loading && <MemorySkeleton />}
        {!loading && memories.length === 0 && <p className="vos-body">No memory suggestions loaded.</p>}
        {memories.map((memory) => (
          <article key={memory.id} className="vos-cell p-3">
            <p className="vos-label text-[rgb(var(--vos-verified))]">{memory.memoryType}</p>
            <p className="mt-2 text-sm leading-6 text-[rgb(var(--vos-text-muted))]">{memory.content}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MemorySkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading memory suggestions">
      {[0, 1, 2].map((item) => (
        <div key={item} className="vos-cell p-3">
          <div className="h-3 w-24 animate-pulse rounded bg-[rgb(var(--vos-unknown-bg))]" />
          <div className="mt-3 h-3 w-full animate-pulse rounded bg-[rgb(var(--vos-unknown-bg))]" />
          <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-[rgb(var(--vos-unknown-bg))]" />
        </div>
      ))}
    </div>
  );
}
