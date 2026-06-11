"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import type { TrustGraphData } from "@/lib/diligence/due-diligence-engine";

type NodeType = TrustGraphData["nodes"][number]["type"];

const nodeTypes: NodeType[] = ["passport", "source", "evidence", "risk"];

const palette: Record<NodeType, { fill: string; stroke: string }> = {
  passport: { fill: "rgb(20 83 45)", stroke: "rgb(34 197 94)" },
  source: { fill: "rgb(30 41 59)", stroke: "rgb(148 163 184)" },
  evidence: { fill: "rgb(12 74 110)", stroke: "rgb(56 189 248)" },
  risk: { fill: "rgb(92 70 8)", stroke: "rgb(234 179 8)" },
};

export function TrustGraphView({ graph }: { graph: TrustGraphData }) {
  const [visibleTypes, setVisibleTypes] = useState<NodeType[]>(nodeTypes);
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState(graph.nodes[0]?.id || "");

  const layout = useMemo(() => layoutGraph(graph, visibleTypes), [graph, visibleTypes]);
  const selected = graph.nodes.find((node) => node.id === selectedId) || layout.nodes[0]?.node;

  function toggleType(type: NodeType) {
    setVisibleTypes((current) => {
      if (current.includes(type) && current.length === 1) return current;
      return current.includes(type) ? current.filter((item) => item !== type) : [...current, type];
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="vos-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[rgb(var(--vos-border))] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="vos-label">Interactive Trust Graph</p>
            <h2 className="mt-1 vos-h2">{layout.nodes.length} visible nodes</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {nodeTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-black uppercase",
                  visibleTypes.includes(type)
                    ? "border-[rgb(var(--vos-primary))] bg-[rgb(var(--vos-primary))] text-[rgb(var(--vos-primary-text))]"
                    : "border-[rgb(var(--vos-border))] bg-[rgb(var(--vos-panel-raised))] text-[rgb(var(--vos-text-muted))]",
                ].join(" ")}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
        <div className="border-b border-[rgb(var(--vos-border))] p-4">
          <label className="grid gap-2 sm:max-w-xs">
            <span className="vos-label">Zoom</span>
            <input
              type="range"
              min="0.75"
              max="1.6"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="accent-[rgb(var(--vos-primary))]"
            />
          </label>
        </div>
        <div className="min-h-[560px] overflow-auto bg-[rgb(var(--vos-surface))] p-4">
          <svg
            role="img"
            aria-label="Evidence trust graph"
            viewBox="0 0 1000 620"
            className="min-h-[560px] w-full min-w-[900px]"
            style={{ transform: `scale(${zoom})`, transformOrigin: "center", transition: "transform 160ms ease" }}
          >
            <defs>
              <pattern id="trust-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgb(45 52 63)" strokeWidth="0.8" opacity="0.45" />
              </pattern>
            </defs>
            <rect width="1000" height="620" fill="url(#trust-grid)" />
            {layout.edges.map((edge) => (
              <g key={edge.id}>
                <line x1={edge.from.x} y1={edge.from.y} x2={edge.to.x} y2={edge.to.y} stroke="rgb(82 92 108)" strokeWidth="1.5" opacity="0.76" />
                <text x={(edge.from.x + edge.to.x) / 2} y={(edge.from.y + edge.to.y) / 2 - 6} fill="rgb(128 138 153)" fontSize="10" fontWeight="700" textAnchor="middle">
                  {edge.label}
                </text>
              </g>
            ))}
            {layout.nodes.map(({ node, x, y }) => {
              const active = selected?.id === node.id;
              const colors = palette[node.type];
              return (
                <g key={node.id} onClick={() => setSelectedId(node.id)} onKeyDown={(event) => event.key === "Enter" && setSelectedId(node.id)} tabIndex={0} className="cursor-pointer outline-none">
                  <circle cx={x} cy={y} r={node.type === "passport" ? 42 : 30} fill={colors.fill} stroke={active ? "rgb(248 250 252)" : colors.stroke} strokeWidth={active ? 4 : 2} />
                  <text x={x} y={y + 4} fill="rgb(248 250 252)" fontSize={node.type === "passport" ? "12" : "10"} fontWeight="800" textAnchor="middle">
                    {shortLabel(node.label)}
                  </text>
                  {typeof node.score === "number" ? (
                    <text x={x} y={y + (node.type === "passport" ? 60 : 46)} fill="rgb(185 192 204)" fontSize="10" fontWeight="700" textAnchor="middle">
                      {node.score}/100
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      <aside className="vos-panel p-5">
        <p className="vos-label">Selected Node</p>
        {selected ? (
          <div className="mt-4 grid gap-4">
            <div>
              <Badge variant={selected.type === "risk" ? "risky" : selected.type === "passport" ? "ready" : "muted"}>{selected.type}</Badge>
              {selected.category ? <Badge variant="outline">{selected.category.replace(/_/g, " ")}</Badge> : null}
            </div>
            <div>
              <h3 className="text-xl font-black text-[rgb(var(--vos-text))]">{selected.label}</h3>
              <p className="mt-2 break-all font-mono text-xs font-bold text-[rgb(var(--vos-text-subtle))]">{selected.id}</p>
            </div>
            <div className="grid gap-3">
              <Detail label="Status" value={selected.status || "Not specified"} />
              <Detail label="Score / Confidence" value={typeof selected.score === "number" ? `${selected.score}/100` : "No score"} />
            </div>
            <p className="text-sm font-semibold leading-6 text-[rgb(var(--vos-text-muted))]">
              The graph connects each software record to source evidence and open risks. Filters hide machinery without deleting audit context.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-sm font-bold text-[rgb(var(--vos-text-muted))]">No graph nodes are available yet.</p>
        )}
      </aside>
    </div>
  );
}

function layoutGraph(graph: TrustGraphData, visibleTypes: NodeType[]) {
  const nodes = graph.nodes.filter((node) => visibleTypes.includes(node.type));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const positioned = nodes.map((node, index) => {
    if (node.type === "passport") {
      const passportIndex = nodes.slice(0, index).filter((item) => item.type === "passport").length;
      return { node, x: 240 + passportIndex * 240, y: 310 };
    }
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2;
    const ring = node.type === "risk" ? 250 : node.type === "source" ? 170 : 220;
    return {
      node,
      x: 500 + Math.cos(angle) * ring,
      y: 310 + Math.sin(angle) * ring,
    };
  });
  const byId = new Map(positioned.map((entry) => [entry.node.id, entry]));
  const edges = graph.edges
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to))
    .flatMap((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      return from && to ? [{ ...edge, from, to }] : [];
    });
  return { nodes: positioned, edges };
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="vos-cell p-3">
      <p className="vos-label">{label}</p>
      <p className="mt-1 text-sm font-black text-[rgb(var(--vos-text))]">{value}</p>
    </div>
  );
}

function shortLabel(value: string) {
  return value.length > 18 ? `${value.slice(0, 15)}...` : value;
}
