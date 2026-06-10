"use client";

import { useCallback, useRef, useState } from "react";
import type { ReactZoomPanPinchContentRef } from "react-zoom-pan-pinch";

const GRID_SIZE = 24;
const LONG_PRESS_MS = 550;

export type CanvasContextMenu = {
  artifactId: string | null;
  x: number;
  y: number;
} | null;

export function useGestures() {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<CanvasContextMenu>(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const selectArtifact = useCallback((artifactId: string, additive = false) => {
    setSelectedIds((current) => {
      const next = new Set(additive ? current : []);
      if (additive && next.has(artifactId)) {
        next.delete(artifactId);
      } else {
        next.add(artifactId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setContextMenu(null);
  }, []);

  const handleArtifactClick = useCallback((event: React.MouseEvent, artifactId: string) => {
    event.stopPropagation();
    selectArtifact(artifactId, event.shiftKey);
  }, [selectArtifact]);

  const handleArtifactPointerDown = useCallback((event: React.PointerEvent, artifactId: string) => {
    clearLongPress();
    if (event.pointerType === "touch") {
      const { clientX, clientY } = event;
      longPressTimerRef.current = setTimeout(() => {
        selectArtifact(artifactId, true);
        setContextMenu({ artifactId, x: clientX, y: clientY });
      }, LONG_PRESS_MS);
    }
  }, [clearLongPress, selectArtifact]);

  const handleContextMenu = useCallback((event: React.MouseEvent, artifactId?: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (artifactId) selectArtifact(artifactId, event.shiftKey);
    setContextMenu({ artifactId: artifactId || null, x: event.clientX, y: event.clientY });
  }, [selectArtifact]);

  const snapToGrid = useCallback((ref: ReactZoomPanPinchContentRef) => {
    const { scale, positionX, positionY } = ref.state;
    if (Math.abs(scale - 1) > 0.03) return;
    const snappedX = Math.round(positionX / GRID_SIZE) * GRID_SIZE;
    const snappedY = Math.round(positionY / GRID_SIZE) * GRID_SIZE;
    if (snappedX !== positionX || snappedY !== positionY) {
      ref.setTransform(snappedX, snappedY, 1, 160, "easeOut");
    }
  }, []);

  return {
    selectedIds,
    contextMenu,
    selectArtifact,
    clearSelection,
    clearContextMenu: () => setContextMenu(null),
    handleArtifactClick,
    handleArtifactPointerDown,
    handleArtifactPointerUp: clearLongPress,
    handleContextMenu,
    snapToGrid,
  };
}
