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
    name: "Software Decision Report",
    priceLabel: "$9",
    unitAmount: 900,
    stripePriceEnv: ["STRIPE_PRICE_APPRAISAL_INSTANT", "STRIPE_APPRAISAL_INSTANT_PRICE_ID"],
    description: "A focused decision report for one software asset before you buy, ship, or integrate it.",
    deliverables: ["Risk summary", "Engineering maturity", "Safety signals", "Decision recommendation"],
  },
  {
    id: "buyer-ready",
    name: "Buyer-Ready Decision Report",
    priceLabel: "$19",
    unitAmount: 1900,
    stripePriceEnv: ["STRIPE_PRICE_APPRAISAL_BUYER", "STRIPE_APPRAISAL_BUYER_PRICE_ID"],
    description: "A buyer-facing package with deeper evidence boundaries, fix plan, unknowns, and signed receipt.",
    deliverables: ["Full risk breakdown", "Fix plan", "Evidence limits", "Assessment confidence", "Signed Evidence Receipt"],
  },
];

export function appraisalOfferFor(value: unknown): AppraisalOffer {
  const clean = String(value || "").trim().toLowerCase();
  return APPRAISAL_OFFERS.find((offer) => offer.id === clean) || APPRAISAL_OFFERS[0];
}

export function stripePriceIdForAppraisalOffer(offer: AppraisalOffer) {
  return offer.stripePriceEnv.map((name) => process.env[name]?.trim()).find(Boolean) || null;
}
