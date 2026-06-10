import assert from "node:assert/strict";

import { ControlPlane, InMemoryControlPlaneStore, reduceControlPlaneState } from "@/lib/control-plane";

assert.equal(reduceControlPlaneState("DRAFT", "STRIPE_PAID"), "PAID");
assert.equal(reduceControlPlaneState("PAID", "INTAKE_RECEIVED"), "INTAKE_RECEIVED");
assert.equal(reduceControlPlaneState("INTAKE_RECEIVED", "SCAN_STARTED"), "SCANNING");
assert.equal(reduceControlPlaneState("SCANNING", "SCAN_COMPLETED", { riskScore: 0.2 }), "APPRAISING");
assert.equal(reduceControlPlaneState("SCANNING", "SCAN_COMPLETED", { riskScore: 0.91 }), "RISKY");
assert.equal(reduceControlPlaneState("VERIFIED", "CERTIFICATE_ISSUED"), "ISSUED");
assert.equal(reduceControlPlaneState("LOCKED", "STRIPE_PAID"), "LOCKED");

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const memory = new InMemoryControlPlaneStore();
  const kernel = new ControlPlane(memory, memory);

  const payment = { entityKind: "payment" as const, entityId: "payment-1", projectId: "project-1" };
  const paid = await kernel.dispatch({ ...payment, name: "STRIPE_PAID", context: { userId: "user-1" } });
  const intake = await kernel.dispatch({ ...payment, name: "INTAKE_RECEIVED" });
  const scanning = await kernel.dispatch({ ...payment, name: "SCAN_STARTED" });
  const risky = await kernel.dispatch({ ...payment, name: "SCAN_COMPLETED", context: { riskScore: 0.82 } });
  const blockedCert = await kernel.dispatch({ ...payment, name: "CERTIFICATE_ISSUED" });

  assert.equal(paid.toState, "PAID");
  assert.equal(intake.toState, "INTAKE_RECEIVED");
  assert.equal(scanning.toState, "SCANNING");
  assert.equal(risky.toState, "RISKY");
  assert.equal(blockedCert.toState, "RISKY");
  assert.equal(blockedCert.changed, false);

  const snapshot = memory.snapshot("payment", "payment-1");
  assert.ok(snapshot);
  assert.equal(snapshot.state, "RISKY");
  assert.ok(snapshot.transitions.length >= 5);
  assert.ok(snapshot.reactions.some((reaction) => reaction.kind === "RUN_APPRAISAL"));
  assert.ok(snapshot.reactions.some((reaction) => reaction.kind === "RUN_SCANNER"));
  assert.ok(snapshot.reactions.some((reaction) => reaction.kind === "REVIEW_RISK"));

  console.log(JSON.stringify({
    passed: true,
    finalState: snapshot.state,
    transitions: snapshot.transitions.length,
    reactions: snapshot.reactions.map((reaction) => reaction.kind),
  }, null, 2));
}
