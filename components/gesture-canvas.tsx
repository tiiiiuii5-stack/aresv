"use client";

import { LocateFixed, Minus, MousePointer2, Plus, RotateCcw } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import { useGestures } from "@/lib/hooks/useGestures";

export type CanvasArtifact = {
  id: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  state: string;
  value: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type GestureCanvasProps = {
  artifacts: CanvasArtifact[];
  preview: ReactNode;
  children?: ReactNode;
};

export function GestureCanvas({ artifacts, preview, children }: GestureCanvasProps) {
  const gestures = useGestures();

  return (
    <div className="relative min-h-[620px] overflow-hidden vos-panel" onClick={gestures.clearContextMenu} onContextMenu={(event) => gestures.handleContextMenu(event)}>
      <TransformWrapper
        minScale={0.5}
        maxScale={3}
        initialScale={1}
        limitToBounds={false}
        centerZoomedOut={false}
        smooth
        wheel={{ step: 0.1 }}
        pinch={{ step: 0.08, allowPanning: true }}
        panning={{ velocityDisabled: false, allowLeftClickPan: true, allowRightClickPan: false, excluded: ["button", "a", "textarea", "input", "select", "iframe"] }}
        velocityAnimation={{ disabled: false, inertia: 0.72, animationTime: 420, maxAnimationTime: 620, animationType: "easeOut" }}
        zoomAnimation={{ disabled: false, animationTime: 180, animationType: "easeOut" }}
        doubleClick={{ mode: "toggle", step: 0.6, animationTime: 180, animationType: "easeOut" }}
        onPanningStop={(ref) => gestures.snapToGrid(ref)}
      >
        {({ zoomIn, zoomOut, resetTransform, centerView, state }) => (
          <>
            <div className="absolute left-3 top-3 z-20 flex items-center gap-2 vos-cell p-2">
              <button type="button" className="grid h-8 w-8 place-items-center rounded-md border border-[rgb(var(--vos-border))] text-[rgb(var(--vos-text))] transition hover:bg-[rgb(var(--vos-panel-raised))]" onClick={() => zoomIn(0.2, 160, "easeOut")} aria-label="Zoom in">
                <Plus className="h-4 w-4" />
              </button>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-md border border-[rgb(var(--vos-border))] text-[rgb(var(--vos-text))] transition hover:bg-[rgb(var(--vos-panel-raised))]" onClick={() => zoomOut(0.2, 160, "easeOut")} aria-label="Zoom out">
                <Minus className="h-4 w-4" />
              </button>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-md border border-[rgb(var(--vos-border))] text-[rgb(var(--vos-text))] transition hover:bg-[rgb(var(--vos-panel-raised))]" onClick={() => resetTransform(180, "easeOut")} aria-label="Reset canvas">
                <RotateCcw className="h-4 w-4" />
              </button>
              <button type="button" className="grid h-8 w-8 place-items-center rounded-md border border-[rgb(var(--vos-border))] text-[rgb(var(--vos-text))] transition hover:bg-[rgb(var(--vos-panel-raised))]" onClick={() => centerView(1, 180, "easeOut")} aria-label="Center canvas">
                <LocateFixed className="h-4 w-4" />
              </button>
              <span className="min-w-12 text-center text-xs font-semibold text-[rgb(var(--vos-text-muted))]">{Math.round(state.scale * 100)}%</span>
            </div>

            <TransformComponent
              infinite
              wrapperClass="!h-[620px] !w-full cursor-grab active:cursor-grabbing"
              contentClass="relative"
              contentStyle={{ width: 1160, height: 900 }}
            >
              <div className="relative h-[900px] w-[1160px] bg-[rgb(var(--vos-surface))]">
                {artifacts.map((artifact) => {
                  const Icon = artifact.icon;
                  const selected = gestures.selectedIds.has(artifact.id);
                  return (
                    <button
                      type="button"
                      key={artifact.id}
                      onClick={(event) => gestures.handleArtifactClick(event, artifact.id)}
                      onPointerDown={(event) => gestures.handleArtifactPointerDown(event, artifact.id)}
                      onPointerUp={gestures.handleArtifactPointerUp}
                      onPointerCancel={gestures.handleArtifactPointerUp}
                      onContextMenu={(event) => gestures.handleContextMenu(event, artifact.id)}
                      className={`vos-panel absolute p-4 text-left transition duration-200 ${selected ? "border-[rgb(var(--vos-verified))]" : "hover:border-[rgb(var(--vos-border-strong))]"}`}
                      style={{ left: artifact.x, top: artifact.y, width: artifact.width, minHeight: artifact.height }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Icon className="h-5 w-5 text-[rgb(var(--vos-primary))]" />
                        {selected ? <MousePointer2 className="h-4 w-4 text-[#10B981]" /> : null}
                      </div>
                      <p className="mt-3 text-sm font-semibold text-[rgb(var(--vos-text))]">{artifact.label}</p>
                      <p className="mt-1 vos-label text-[rgb(var(--vos-verified))]">{artifact.state}</p>
                      <p className="mt-2 min-h-[40px] text-xs leading-5 text-[rgb(var(--vos-text-muted))]">{artifact.value}</p>
                    </button>
                  );
                })}

                <div className="absolute left-[40px] top-[220px] w-[720px]">{preview}</div>
                <div className="absolute left-[790px] top-[220px] w-[320px]">{children}</div>
              </div>
            </TransformComponent>

            {gestures.contextMenu ? (
              <div className="fixed z-50 w-48 vos-cell p-2 text-sm" style={{ left: gestures.contextMenu.x, top: gestures.contextMenu.y }} onClick={(event) => event.stopPropagation()}>
                <button type="button" disabled title="Artifact inspection is shown through selection and the preview panel." className="block w-full cursor-not-allowed rounded-md px-3 py-2 text-left text-[rgb(var(--vos-text-muted))] opacity-70">
                  Inspect via preview panel
                </button>
                <button type="button" disabled title="Canvas pinning is not available in this build." className="block w-full cursor-not-allowed rounded-md px-3 py-2 text-left text-[rgb(var(--vos-text-muted))] opacity-70">
                  Pin unavailable
                </button>
                <button type="button" className="block w-full rounded-md px-3 py-2 text-left text-[rgb(var(--vos-danger))] hover:bg-[rgb(var(--vos-panel-raised))]" onClick={gestures.clearSelection}>
                  Clear selection
                </button>
              </div>
            ) : null}
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
