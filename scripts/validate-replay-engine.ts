import assert from "node:assert/strict";

import { replayTransitions } from "@/lib/control-plane/replay";
import type { ControlPlaneTransition } from "@/lib/control-plane";

const transitions: ControlPlaneTransition[] = [
  transition("t1", "DRAFT", "PAID", "STRIPE_PAID"),
  transition("t2", "PAID", "INTAKE_RECEIVED", "INTAKE_RECEIVED"),
  transition("t3", "INTAKE_RECEIVED", "SCANNING", "SCAN_STARTED"),
  transition("t4", "SCANNING", "APPRAISING", "SCAN_COMPLETED", { riskScore: 0.1 }),
  transition("t5", "APPRAISING", "VERIFIED", "APPRAISAL_CREATED"),
  transition("t6", "VERIFIED", "ISSUED", "CERTIFICATE_ISSUED"),
  transition("t7", "ISSUED", "TRANSPARENCY_LOCKED", "TRANSPARENCY_WRITTEN"),
  transition("t8", "TRANSPARENCY_LOCKED", "LOCKED", "LOCKED"),
];

const replay = replayTransitions({
  entityKind: "payment",
  entityId: "payment-replay-test",
  transitions,
});

assert.equal(replay.currentState, "LOCKED");
assert.equal(replay.eventCount, 8);
assert.equal(replay.changedCount, 8);
assert.equal(replay.mismatches.length, 0);
assert.equal(replay.timeline[3]?.event, "SCAN_COMPLETED");

const riskyReplay = replayTransitions({
  entityKind: "payment",
  entityId: "payment-risk-replay-test",
  transitions: [
    transition("r1", "DRAFT", "PAID", "STRIPE_PAID"),
    transition("r2", "PAID", "INTAKE_RECEIVED", "INTAKE_RECEIVED"),
    transition("r3", "INTAKE_RECEIVED", "SCANNING", "SCAN_STARTED"),
    transition("r4", "SCANNING", "RISKY", "SCAN_COMPLETED", { riskScore: 0.91 }),
  ],
});

assert.equal(riskyReplay.currentState, "RISKY");
assert.equal(riskyReplay.mismatches.length, 0);

console.log(JSON.stringify({
  passed: true,
  replay: {
    state: replay.currentState,
    events: replay.eventCount,
  },
  riskyReplay: {
    state: riskyReplay.currentState,
    events: riskyReplay.eventCount,
  },
}, null, 2));

function transition(
  id: string,
  fromState: ControlPlaneTransition["fromState"],
  toState: ControlPlaneTransition["toState"],
  event: ControlPlaneTransition["event"],
  context: Record<string, unknown> = {},
): ControlPlaneTransition {
  return {
    id,
    entityId: "payment-replay-test",
    entityKind: "payment",
    event,
    fromState,
    toState,
    changed: fromState !== toState,
    accepted: true,
    occurredAt: `2026-06-09T00:00:0${id.replace(/\D/g, "") || "0"}.000Z`,
    traceId: null,
    contextHash: id,
    context,
  };
}
