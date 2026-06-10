import { getPrisma, tryDatabase } from "@/lib/prisma";
import { enqueuePipelineJob } from "@/lib/pipeline/jobQueue";
import type {
  ControlPlaneEntityKind,
  ControlPlaneReaction,
  ControlPlaneReactionSink,
  ControlPlaneState,
  ControlPlaneStore,
  ControlPlaneTransition,
} from "@/lib/control-plane/kernel";
import { sanitizeMetadata } from "@/lib/services/platformSupport";

type MemoryRecord = {
  state: ControlPlaneState;
  transitions: ControlPlaneTransition[];
  reactions: ControlPlaneReaction[];
};

export class InMemoryControlPlaneStore implements ControlPlaneStore, ControlPlaneReactionSink {
  private readonly records = new Map<string, MemoryRecord>();

  async getState(entityKind: ControlPlaneEntityKind, entityId: string) {
    return this.records.get(keyFor(entityKind, entityId))?.state || null;
  }

  async saveState(entityKind: ControlPlaneEntityKind, entityId: string, state: ControlPlaneState) {
    const key = keyFor(entityKind, entityId);
    const record = this.records.get(key) || { state, transitions: [], reactions: [] };
    record.state = state;
    this.records.set(key, record);
  }

  async writeEvent(transition: ControlPlaneTransition) {
    const key = keyFor(transition.entityKind, transition.entityId);
    const record = this.records.get(key) || { state: transition.toState, transitions: [], reactions: [] };
    record.transitions.push(transition);
    this.records.set(key, record);
  }

  async enqueue(reaction: ControlPlaneReaction) {
    const key = keyFor(reaction.entityKind, reaction.entityId);
    const record = this.records.get(key) || { state: "DRAFT" as const, transitions: [], reactions: [] };
    record.reactions.push(reaction);
    this.records.set(key, record);
  }

  snapshot(entityKind: ControlPlaneEntityKind, entityId: string) {
    return this.records.get(keyFor(entityKind, entityId)) || null;
  }
}

export class PrismaControlPlaneStore implements ControlPlaneStore {
  async getState(entityKind: ControlPlaneEntityKind, entityId: string) {
    const rows = await tryDatabase((db) =>
      db.$queryRawUnsafe<Array<{ metadata: unknown }>>(
        `SELECT "metadata"
         FROM "usage_events"
         WHERE "event" = 'control_plane.state'
           AND "metadata"->>'entityKind' = $1
           AND "metadata"->>'entityId' = $2
         ORDER BY "createdAt" DESC
         LIMIT 1`,
        entityKind,
        entityId,
      ),
    );
    const state = readState(rows?.[0]?.metadata);
    return state || null;
  }

  async saveState(entityKind: ControlPlaneEntityKind, entityId: string, state: ControlPlaneState, transition: ControlPlaneTransition) {
    await tryDatabase(async (db) => {
      await db.$executeRawUnsafe(
        `INSERT INTO "usage_events" ("userId", "projectId", "event", "metadata")
         VALUES ($1, $2, 'control_plane.state', $3::jsonb)`,
        userIdFromContext(transition.context),
        projectIdFor(transition),
        JSON.stringify(sanitizeMetadata({
          entityKind,
          entityId,
          state,
          transitionId: transition.id,
          event: transition.event,
          occurredAt: transition.occurredAt,
        })),
      );
    });
  }

  async writeEvent(transition: ControlPlaneTransition) {
    await tryDatabase(async (db) => {
      await db.$executeRawUnsafe(
        `INSERT INTO "usage_events" ("userId", "projectId", "event", "metadata")
         VALUES ($1, $2, 'control_plane.transition', $3::jsonb)`,
        userIdFromContext(transition.context),
        projectIdFor(transition),
        JSON.stringify(sanitizeMetadata(transition as unknown as Record<string, unknown>)),
      );
    });
  }
}

export class PrismaControlPlaneReactionSink implements ControlPlaneReactionSink {
  async enqueue(reaction: ControlPlaneReaction, transition: ControlPlaneTransition) {
    const db = getPrisma();
    if (db) {
      await db.$executeRawUnsafe(
        `INSERT INTO "usage_events" ("userId", "projectId", "event", "metadata")
         VALUES ($1, $2, 'control_plane.reaction.queued', $3::jsonb)`,
        userIdFromContext(transition.context),
        projectIdFor(transition),
        JSON.stringify(sanitizeMetadata({
          ...reaction,
          transitionId: transition.id,
          event: transition.event,
          toState: transition.toState,
          pipelineJobType: pipelineTypeForReaction(reaction.kind),
        })),
      );
    }

    await enqueuePipelineJob({
      type: pipelineTypeForReaction(reaction.kind),
      entityId: reaction.entityId,
      entityKind: reaction.entityKind,
      projectId: reaction.projectId || projectIdFor(transition),
      idempotencyKey: `${transition.id}:${reaction.kind}`,
      payload: {
        ...reaction.payload,
        reason: reaction.reason,
        event: transition.event,
        fromState: transition.fromState,
        toState: transition.toState,
        traceId: transition.traceId || null,
      },
    });
  }
}

function pipelineTypeForReaction(kind: ControlPlaneReaction["kind"]) {
  switch (kind) {
    case "RUN_APPRAISAL":
      return "runAppraisal";
    case "RUN_SCANNER":
      return "runScanner";
    case "GENERATE_CERTIFICATE":
      return "generateCertificate";
    case "WRITE_TRANSPARENCY_LOG":
      return "writeTransparencyLog";
    case "LOCK_ASSET":
      return "lockAsset";
    case "REVIEW_RISK":
      return "reviewRisk";
    case "RECORD_FAILURE":
      return "recordFailure";
  }
}

function keyFor(entityKind: ControlPlaneEntityKind, entityId: string) {
  return `${entityKind}:${entityId}`;
}

function readState(metadata: unknown): ControlPlaneState | null {
  const state = (metadata as { state?: unknown } | null)?.state;
  return typeof state === "string" ? state as ControlPlaneState : null;
}

function projectIdFor(transition: ControlPlaneTransition) {
  const projectId = typeof transition.context.projectId === "string" ? transition.context.projectId.trim() : "";
  return projectId || (transition.entityKind === "project" ? transition.entityId : null);
}

function userIdFromContext(context: Record<string, unknown>) {
  const userId = typeof context.userId === "string" ? context.userId.trim() : "";
  return userId || null;
}
