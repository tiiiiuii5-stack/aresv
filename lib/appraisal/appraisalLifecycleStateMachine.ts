export type PaidAppraisalLifecycleState =
  | "CHECKOUT_CREATED"
  | "PAYMENT_RECEIVED"
  | "AWAITING_INTAKE"
  | "INTAKE_RECEIVED"
  | "SCANNING"
  | "APPRAISING"
  | "CERTIFYING"
  | "FULFILLED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";

export type PaidAppraisalLifecycleEvent =
  | "checkout.created"
  | "payment.received"
  | "intake.received"
  | "scan.started"
  | "scan.completed"
  | "appraisal.started"
  | "appraisal.completed"
  | "certificate.started"
  | "certificate.issued"
  | "fulfillment.completed"
  | "failure.recorded"
  | "checkout.cancelled"
  | "payment.refunded";

export type PaidAppraisalPaymentFields = {
  status: "pending" | "paid" | "failed" | "cancelled" | "refunded";
  fulfillmentStatus:
    | "pending"
    | "awaiting_intake"
    | "intake_received"
    | "scanning"
    | "appraising"
    | "certifying"
    | "fulfilled"
    | "failed"
    | "cancelled"
    | "refunded";
};

const transitions: Record<PaidAppraisalLifecycleState, Partial<Record<PaidAppraisalLifecycleEvent, PaidAppraisalLifecycleState>>> = {
  CHECKOUT_CREATED: {
    "payment.received": "PAYMENT_RECEIVED",
    "checkout.cancelled": "CANCELLED",
    "failure.recorded": "FAILED",
  },
  PAYMENT_RECEIVED: {
    "payment.received": "PAYMENT_RECEIVED",
    "intake.received": "INTAKE_RECEIVED",
    "payment.refunded": "REFUNDED",
    "failure.recorded": "FAILED",
  },
  AWAITING_INTAKE: {
    "payment.received": "AWAITING_INTAKE",
    "intake.received": "INTAKE_RECEIVED",
    "payment.refunded": "REFUNDED",
    "failure.recorded": "FAILED",
  },
  INTAKE_RECEIVED: {
    "payment.received": "INTAKE_RECEIVED",
    "intake.received": "INTAKE_RECEIVED",
    "scan.started": "SCANNING",
    "payment.refunded": "REFUNDED",
    "failure.recorded": "FAILED",
  },
  SCANNING: {
    "payment.received": "SCANNING",
    "intake.received": "SCANNING",
    "scan.started": "SCANNING",
    "scan.completed": "APPRAISING",
    "failure.recorded": "FAILED",
  },
  APPRAISING: {
    "payment.received": "APPRAISING",
    "intake.received": "APPRAISING",
    "scan.started": "APPRAISING",
    "scan.completed": "APPRAISING",
    "appraisal.completed": "CERTIFYING",
    "failure.recorded": "FAILED",
  },
  CERTIFYING: {
    "payment.received": "CERTIFYING",
    "intake.received": "CERTIFYING",
    "scan.started": "CERTIFYING",
    "scan.completed": "CERTIFYING",
    "appraisal.completed": "CERTIFYING",
    "certificate.issued": "FULFILLED",
    "fulfillment.completed": "FULFILLED",
    "failure.recorded": "FAILED",
  },
  FULFILLED: {
    "payment.received": "FULFILLED",
    "fulfillment.completed": "FULFILLED",
    "payment.refunded": "REFUNDED",
  },
  FAILED: {
    "payment.received": "AWAITING_INTAKE",
    "intake.received": "INTAKE_RECEIVED",
  },
  CANCELLED: {
    "payment.received": "AWAITING_INTAKE",
  },
  REFUNDED: {},
};

export function transitionPaidAppraisalLifecycle(
  current: PaidAppraisalLifecycleState,
  event: PaidAppraisalLifecycleEvent,
) {
  const next = transitions[current]?.[event];
  if (!next) {
    throw new Error(`INVALID_PAID_APPRAISAL_TRANSITION:${current}:${event}`);
  }
  return next;
}

export function paymentFieldsForLifecycleState(state: PaidAppraisalLifecycleState): PaidAppraisalPaymentFields {
  switch (state) {
    case "CHECKOUT_CREATED":
      return { status: "pending", fulfillmentStatus: "pending" };
    case "PAYMENT_RECEIVED":
    case "AWAITING_INTAKE":
      return { status: "paid", fulfillmentStatus: "awaiting_intake" };
    case "INTAKE_RECEIVED":
      return { status: "paid", fulfillmentStatus: "intake_received" };
    case "SCANNING":
      return { status: "paid", fulfillmentStatus: "scanning" };
    case "APPRAISING":
      return { status: "paid", fulfillmentStatus: "appraising" };
    case "CERTIFYING":
      return { status: "paid", fulfillmentStatus: "certifying" };
    case "FULFILLED":
      return { status: "paid", fulfillmentStatus: "fulfilled" };
    case "FAILED":
      return { status: "failed", fulfillmentStatus: "failed" };
    case "CANCELLED":
      return { status: "cancelled", fulfillmentStatus: "cancelled" };
    case "REFUNDED":
      return { status: "refunded", fulfillmentStatus: "refunded" };
  }
}

export function lifecycleStateFromPaymentFields(input: {
  status?: string | null;
  fulfillmentStatus?: string | null;
}): PaidAppraisalLifecycleState {
  const status = String(input.status || "").toLowerCase();
  const fulfillmentStatus = String(input.fulfillmentStatus || "").toLowerCase();
  if (status === "refunded" || fulfillmentStatus === "refunded") return "REFUNDED";
  if (status === "cancelled" || fulfillmentStatus === "cancelled") return "CANCELLED";
  if (status === "failed" || fulfillmentStatus === "failed") return "FAILED";
  if (fulfillmentStatus === "fulfilled") return "FULFILLED";
  if (fulfillmentStatus === "certifying") return "CERTIFYING";
  if (fulfillmentStatus === "appraising") return "APPRAISING";
  if (fulfillmentStatus === "scanning") return "SCANNING";
  if (fulfillmentStatus === "intake_received") return "INTAKE_RECEIVED";
  if (status === "paid" || fulfillmentStatus === "awaiting_intake") return "AWAITING_INTAKE";
  return "CHECKOUT_CREATED";
}

export function assertPaidAppraisalTransition(input: {
  current: PaidAppraisalLifecycleState;
  event: PaidAppraisalLifecycleEvent;
}) {
  return transitionPaidAppraisalLifecycle(input.current, input.event);
}
