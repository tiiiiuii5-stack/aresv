import {
  reduceControlPlaneState,
  type ControlPlaneEntityKind,
  type ControlPlaneEventName,
  type ControlPlaneState,
  type ControlPlaneTransition,
} from "@/lib/control-plane/kernel";
import { tryDatabase } from "@/lib/prisma";

export type ReplayTimelineItem = {
  id: string;
  event: ControlPlaneEventName;
  fromState: ControlPlaneState;
  toState: ControlPlaneState;
  reducerState: ControlPlaneState;
  matchedStoredState: boolean;
  changed: boolean;
  occurredAt: string;
  traceId?: string | null;
  context: Record<string, unknown>;
};

export type EntityReplay = {
  entityKind: ControlPlaneEntityKind;
  entityId: string;
  initialState: ControlPlaneState;
  currentState: ControlPlaneState;
  eventCount: number;
  changedCount: number;
  mismatches: ReplayTimelineItem[];
  timeline: ReplayTimelineItem[];
};

type UsageEventRow = {
  id: string;
  metadata: unknown;
  createdAt: Date | string;
};

export async function replayEntity(input: {
  entityKind: ControlPlaneEntityKind;
  entityId: string;
  initialState?: ControlPlaneState;
}): Promise<EntityReplay> {
  return replayTransitions({
    entityKind: input.entityKind,
    entityId: input.entityId,
    transitions: await loadEntityTransitions(input.entityKind, input.entityId),
    initialState: input.initialState || "DRAFT",
  });
}

export function replayTransitions(input: {
  entityKind: ControlPlaneEntityKind;
  entityId: string;
  transitions: ControlPlaneTransition[];
  initialState?: ControlPlaneState;
}): EntityReplay {
  let state = input.initialState || "DRAFT";
  const timeline = input.transitions
    .sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime())
    .map((transition) => {
      const reducerState = reduceControlPlaneState(state, transition.event, transition.context);
      const item: ReplayTimelineItem = {
        id: transition.id,
        event: transition.event,
        fromState: transition.fromState,
        toState: transition.toState,
        reducerState,
        matchedStoredState: reducerState === transition.toState,
        changed: transition.changed,
        occurredAt: transition.occurredAt,
        traceId: transition.traceId || null,
        context: transition.context,
      };
      state = reducerState;
      return item;
    });

  return {
    entityKind: input.entityKind,
    entityId: input.entityId,
    initialState: input.initialState || "DRAFT",
    currentState: state,
    eventCount: timeline.length,
    changedCount: timeline.filter((item) => item.changed).length,
    mismatches: timeline.filter((item) => !item.matchedStoredState),
    timeline,
  };
}

export async function loadEntityTransitions(entityKind: ControlPlaneEntityKind, entityId: string) {
  const rows = await tryDatabase((db) =>
    db.$queryRawUnsafe<UsageEventRow[]>(
      `SELECT "id", "metadata", "createdAt"
       FROM "usage_events"
       WHERE "event" = 'control_plane.transition'
         AND "metadata"->>'entityKind' = $1
         AND "metadata"->>'entityId' = $2
       ORDER BY "createdAt" ASC
       LIMIT 500`,
      entityKind,
      entityId,
    ),
  );
  return (rows || []).map(rowToTransition).filter((transition): transition is ControlPlaneTransition => Boolean(transition));
}

function rowToTransition(row: UsageEventRow): ControlPlaneTransition | null {
  const metadata = objectValue(row.metadata);
  const event = stringValue(metadata.event) as ControlPlaneEventName;
  const entityKind = stringValue(metadata.entityKind) as ControlPlaneEntityKind;
  const entityId = stringValue(metadata.entityId);
  const fromState = stringValue(metadata.fromState) as ControlPlaneState;
  const toState = stringValue(metadata.toState) as ControlPlaneState;
  if (!event || !entityKind || !entityId || !fromState || !toState) return null;
  return {
    id: stringValue(metadata.id) || row.id,
    entityId,
    entityKind,
    event,
    fromState,
    toState,
    changed: Boolean(metadata.changed),
    accepted: metadata.accepted !== false,
    occurredAt: stringValue(metadata.occurredAt) || isoDate(row.createdAt),
    traceId: stringValue(metadata.traceId) || null,
    contextHash: stringValue(metadata.contextHash),
    context: objectValue(metadata.context),
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}
