export type AppraisalOfferId = "instant" | "buyer-ready";

export type AppraisalOffer = {
  id: AppraisalOfferId;
  name: string;
  priceLabel: string;
  unitAmount: number;
  stripePriceEnv: string[];
  description: string;
  deliverables: string[];
};

export const APPRAISAL_OFFERS: AppraisalOffer[] = [
  {
    id: "instant",
    name: "Verified System Report",
    priceLabel: "Free",
    unitAmount: 0,
    stripePriceEnv: ["STRIPE_PRICE_APPRAISAL_INSTANT", "STRIPE_APPRAISAL_INSTANT_PRICE_ID"],
    description: "Automated readiness score, top risk evidence, repair estimate, and Signed Verification Badge.",
    deliverables: ["Readiness score", "Top risk evidence", "Repair estimate", "Signed Verification Badge"],
  },
  {
    id: "buyer-ready",
    name: "Buyer-Ready Verified Report",
    priceLabel: "Free",
    unitAmount: 0,
    stripePriceEnv: ["STRIPE_PRICE_APPRAISAL_BUYER", "STRIPE_APPRAISAL_BUYER_PRICE_ID"],
    description: "Deeper buyer-facing technical report with fix plan, evidence limits, repair estimate, and Signed Verification Badge.",
    deliverables: ["Private evidence report", "Fix plan", "Evidence limits", "Transfer readiness", "Signed Verification Badge"],
  },
];

export function appraisalOfferFor(value: unknown): AppraisalOffer {
  const clean = String(value || "").trim().toLowerCase();
  return APPRAISAL_OFFERS.find((offer) => offer.id === clean) || APPRAISAL_OFFERS[0];
}

export function stripePriceIdForAppraisalOffer(offer: AppraisalOffer) {
  return offer.stripePriceEnv.map((name) => process.env[name]?.trim()).find(Boolean) || null;
}
