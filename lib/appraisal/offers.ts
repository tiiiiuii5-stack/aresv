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
    name: "Evidence Review Report",
    priceLabel: "Free",
    unitAmount: 0,
    stripePriceEnv: ["STRIPE_PRICE_APPRAISAL_INSTANT", "STRIPE_APPRAISAL_INSTANT_PRICE_ID"],
    description: "Evidence-scoped readiness summary, observed risks, unknowns, and a signed evidence receipt.",
    deliverables: ["Observed facts", "Risk evidence", "Unknowns and limitations", "Signed Evidence Receipt"],
  },
  {
    id: "buyer-ready",
    name: "Buyer Evidence Review",
    priceLabel: "Free",
    unitAmount: 0,
    stripePriceEnv: ["STRIPE_PRICE_APPRAISAL_BUYER", "STRIPE_APPRAISAL_BUYER_PRICE_ID"],
    description: "Buyer-facing evidence review with fix plan, confidence levels, evidence limits, and a signed evidence receipt.",
    deliverables: ["Evidence review package", "Fix plan", "Evidence limits", "Assessment confidence", "Signed Evidence Receipt"],
  },
];

export function appraisalOfferFor(value: unknown): AppraisalOffer {
  const clean = String(value || "").trim().toLowerCase();
  return APPRAISAL_OFFERS.find((offer) => offer.id === clean) || APPRAISAL_OFFERS[0];
}

export function stripePriceIdForAppraisalOffer(offer: AppraisalOffer) {
  return offer.stripePriceEnv.map((name) => process.env[name]?.trim()).find(Boolean) || null;
}
