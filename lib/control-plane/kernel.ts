import { createHash, randomUUID } from "node:crypto";

export type ControlPlaneEntityKind =
  | "payment"
  | "project"
  | "appraisal"
  | "certificate"
  | "scan"
  | "system";

export type ControlPlaneEventName =
  | "STRIPE_PAID"
  | "INTAKE_RECEIVED"
  | "SCAN_REQUESTED"
  | "SCAN_STARTED"
  | "SCAN_COMPLETED"
  | "RISK_FOUND"
  | "APPROVED"
  | "APPRAISAL_CREATED"
  | "CERTIFICATE_ISSUED"
  | "TRANSPARENCY_WRITTEN"
  | "LOCKED"
  | "FAILED"
  | "REFUNDED"
  | "CANCELLED";

export type ControlPlaneState =
  | "DRAFT"
  | "PAID"
  | "AWAITING_INTAKE"
  | "INTAKE_RECEIVED"
  | "SCANNING"
  | "RISKY"
  | "APPRAISING"
  | "VERIFIED"
  | "CERTIFYING"
  | "ISSUED"
  | "TRANSPARENCY_LOCKED"
  | "LOCKED"
  | "FAILED"
  | "REFUNDED"
  | "CANCELLED";

export type ControlPlaneEvent = {
  id?: string;
  name: ControlPlaneEventName;
  entityId: string;
  entityKind: ControlPlaneEntityKind;
  actorId?: string | null;
  projectId?: string | null;
  occurredAt?: string;
  traceId?: string | null;
  context?: ControlPlaneContext;
};

export type ControlPlaneContext = {
  riskScore?: number | null;
  readinessScore?: number | null;
  riskLevel?: string | null;
  reason?: string | null;
  source?: string | null;
  [key: string]: unknown;
};

export type ControlPlaneTransition = {
  id: string;
  entityId: string;
  entityKind: ControlPlaneEntityKind;
  event: ControlPlaneEventName;
  fromState: ControlPlaneState;
  toState: ControlPlaneState;
  changed: boolean;
  accepted: boolean;
  occurredAt: string;
  traceId?: string | null;
  contextHash: string;
  context: ControlPlaneContext;
};

export type ControlPlaneReactionKind =
  | "RUN_APPRAISAL"
  | "RUN_SCANNER"
  | "GENERATE_CERTIFICATE"
  | "WRITE_TRANSPARENCY_LOG"
  | "LOCK_ASSET"
  | "REVIEW_RISK"
  | "RECORD_FAILURE";

export type ControlPlaneReaction = {
  kind: ControlPlaneReactionKind;
  entityId: string;
  entityKind: ControlPlaneEntityKind;
  projectId?: string | null;
  reason: string;
  payload: Record<string, unknown>;
};

export type ControlPlaneStore = {
  getState(entityKind: ControlPlaneEntityKind, entityId: string): Promise<ControlPlaneState | null>;
  saveState(entityKind: ControlPlaneEntityKind, entityId: string, state: ControlPlaneState, transition: ControlPlaneTransition): Promise<void>;
  writeEvent(transition: ControlPlaneTransition): Promise<void>;
};

export type ControlPlaneReactionSink = {
  enqueue(reaction: ControlPlaneReaction, transition: ControlPlaneTransition): Promise<void>;
};

const terminalStates = new Set<ControlPlaneState>(["LOCKED", "FAILED", "REFUNDED", "CANCELLED"]);

const deterministicTransitions: Partial<Record<ControlPlaneState, Partial<Record<ControlPlaneEventName, ControlPlaneState>>>> = {
  DRAFT: {
    STRIPE_PAID: "PAID",
    SCAN_REQUESTED: "SCANNING",
    CANCELLED: "CANCELLED",
    FAILED: "FAILED",
  },
  PAID: {
    STRIPE_PAID: "PAID",
    INTAKE_RECEIVED: "INTAKE_RECEIVED",
    REFUNDED: "REFUNDED",
    CANCELLED: "CANCELLED",
    FAILED: "FAILED",
  },
  AWAITING_INTAKE: {
    STRIPE_PAID: "AWAITING_INTAKE",
    INTAKE_RECEIVED: "INTAKE_RECEIVED",
    REFUNDED: "REFUNDED",
    CANCELLED: "CANCELLED",
    FAILED: "FAILED",
  },
  INTAKE_RECEIVED: {
    SCAN_REQUESTED: "SCANNING",
    SCAN_STARTED: "SCANNING",
    REFUNDED: "REFUNDED",
    FAILED: "FAILED",
  },
  SCANNING: {
    SCAN_STARTED: "SCANNING",
    SCAN_COMPLETED: "APPRAISING",
    RISK_FOUND: "RISKY",
    FAILED: "FAILED",
  },
  RISKY: {
    APPROVED: "APPRAISING",
    SCAN_REQUESTED: "SCANNING",
    FAILED: "FAILED",
  },
  APPRAISING: {
    APPRAISAL_CREATED: "VERIFIED",
    RISK_FOUND: "RISKY",
    FAILED: "FAILED",
  },
  VERIFIED: {
    CERTIFICATE_ISSUED: "ISSUED",
    FAILED: "FAILED",
  },
  CERTIFYING: {
    CERTIFICATE_ISSUED: "ISSUED",
    FAILED: "FAILED",
  },
  ISSUED: {
    TRANSPARENCY_WRITTEN: "TRANSPARENCY_LOCKED",
    LOCKED: "LOCKED",
    FAILED: "FAILED",
  },
  TRANSPARENCY_LOCKED: {
    LOCKED: "LOCKED",
  },
};

export function reduceControlPlaneState(
  state: ControlPlaneState,
  event: ControlPlaneEventName,
  context: ControlPlaneContext = {},
): ControlPlaneState {
  if (terminalStates.has(state)) return state;
  if (state === "SCANNING" && event === "SCAN_COMPLETED" && riskRequiresReview(context)) return "RISKY";
  if (state === "APPRAISING" && event === "APPRAISAL_CREATED" && riskRequiresReview(context)) return "RISKY";
  return deterministicTransitions[state]?.[event] || state;
}

export function reactionsForTransition(transition: ControlPlaneTransition): ControlPlaneReaction[] {
  if (!transition.changed || !transition.accepted) return [];

  const base = {
    entityId: transition.entityId,
    entityKind: transition.entityKind,
    projectId: stringOrNull(transition.context.projectId) || undefined,
  };

  switch (transition.toState) {
    case "PAID":
    case "AWAITING_INTAKE":
      return [{
        ...base,
        kind: "RUN_APPRAISAL",
        reason: "Payment changed state; appraisal entitlement must be prepared.",
        payload: reactionPayload(transition),
      }];
    case "INTAKE_RECEIVED":
    case "SCANNING":
      return [{
        ...base,
        kind: "RUN_SCANNER",
        reason: "Evidence intake is present; scanner owns the next external work.",
        payload: reactionPayload(transition),
      }];
    case "RISKY":
      return [{
        ...base,
        kind: "REVIEW_RISK",
        reason: "Risk crossed the control-plane threshold and requires explicit approval or repair.",
        payload: reactionPayload(transition),
      }];
    case "APPRAISING":
      return [{
        ...base,
        kind: "RUN_APPRAISAL",
        reason: "Scan completed; appraisal worker can evaluate the verified evidence package.",
        payload: reactionPayload(transition),
      }];
    case "VERIFIED":
      return [{
        ...base,
        kind: "GENERATE_CERTIFICATE",
        reason: "Appraisal is verified; certificate generation can react.",
        payload: reactionPayload(transition),
      }];
    case "ISSUED":
      return [{
        ...base,
        kind: "WRITE_TRANSPARENCY_LOG",
        reason: "Certificate was issued; transparency log can react.",
        payload: reactionPayload(transition),
      }];
    case "TRANSPARENCY_LOCKED":
      return [{
        ...base,
        kind: "LOCK_ASSET",
        reason: "Transparency log was written; asset can be locked.",
        payload: reactionPayload(transition),
      }];
    case "FAILED":
      return [{
        ...base,
        kind: "RECORD_FAILURE",
        reason: "Control-plane entity entered a failure state.",
        payload: reactionPayload(transition),
      }];
    default:
      return [];
  }
}

export class ControlPlane {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly reactionSink: ControlPlaneReactionSink,
    private readonly defaultState: ControlPlaneState = "DRAFT",
  ) {}

  async dispatch(event: ControlPlaneEvent) {
    const currentState = await this.store.getState(event.entityKind, event.entityId) || this.defaultState;
    const context = normalizeContext({ ...(event.context || {}), projectId: event.projectId || event.context?.projectId || null });
    const nextState = reduceControlPlaneState(currentState, event.name, context);
    const transition: ControlPlaneTransition = {
      id: event.id || randomUUID(),
      entityId: event.entityId,
      entityKind: event.entityKind,
      event: event.name,
      fromState: currentState,
      toState: nextState,
      changed: currentState !== nextState,
      accepted: currentState !== nextState || deterministicTransitions[currentState]?.[event.name] === currentState,
      occurredAt: event.occurredAt || new Date().toISOString(),
      traceId: event.traceId || null,
      contextHash: stableHash(context),
      context,
    };

    await this.store.writeEvent(transition);
    if (transition.changed) {
      await this.store.saveState(event.entityKind, event.entityId, nextState, transition);
      for (const reaction of reactionsForTransition(transition)) {
        await this.reactionSink.enqueue(reaction, transition);
      }
    }

    return transition;
  }
}

function riskRequiresReview(context: ControlPlaneContext) {
  const riskScore = numberOrNull(context.riskScore);
  const readinessScore = numberOrNull(context.readinessScore);
  const riskLevel = String(context.riskLevel || "").toLowerCase();
  if (riskScore !== null) return riskScore >= 0.7;
  if (readinessScore !== null) return readinessScore < 75;
  return ["critical", "high", "block", "blocked", "risky"].includes(riskLevel);
}

function reactionPayload(transition: ControlPlaneTransition) {
  return {
    controlPlaneTransitionId: transition.id,
    event: transition.event,
    fromState: transition.fromState,
    toState: transition.toState,
    contextHash: transition.contextHash,
    traceId: transition.traceId || null,
  };
}

function normalizeContext(context: ControlPlaneContext) {
  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined),
  ) as ControlPlaneContext;
}

function stableHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(sortObject(value))).digest("hex");
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, sortObject(nested)]));
}

function numberOrNull(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function stringOrNull(value: unknown) {
  const stringValue = typeof value === "string" ? value.trim() : "";
  return stringValue || null;
}
