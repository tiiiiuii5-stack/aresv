import { createHash } from "node:crypto";

import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

import { canonicalAppUrl } from "@/lib/appraisal/app-url";
import { appraisalOfferFor, stripePriceIdForAppraisalOffer } from "@/lib/appraisal/offers";
import { createSoftwareAppraisal } from "@/lib/appraisal/appraisalEngine";
import { markPaidAppraisalPaymentFulfilled, recordPaidAppraisalPayment, transitionPaidAppraisalPayment } from "@/lib/appraisal/paymentFulfillment";
import { issueCertificateForAppraisal, loadLatestPublicCertificateForAppraisal } from "@/lib/certificates/certificateService";
import { createTrace, errorResponse, trace, withStep } from "@/lib/diagnostics";
import { getPrisma } from "@/lib/persistence/database";
import { persistProject } from "@/lib/persistence/project-repository";
import { loadPublicGitHubRepositorySource, type PublicGitHubRepositorySource } from "@/lib/repositories/public-github-source";
import { enforceRateLimit } from "@/lib/security/backendSecurity";
import { sanitizeMetadata } from "@/lib/services/platformSupport";
import { ventureOSIntelligenceService } from "@/lib/services/intelligenceAnalysis";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";
import type { ProjectRecord } from "@/lib/project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const intakeRateLimit = { name: "free-appraisal-intake", limit: 20, windowMs: 60 * 60_000 };
const MAX_APPRAISAL_CODE_LENGTH = 180_000;

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "appraisal-intake",
    method: "POST",
    status: "ready",
    free: true,
    message: "Submit source evidence with POST to generate a free VentureOS report.",
  });
}

export async function POST(request: NextRequest) {
  const traceId = createTrace("appraisal-intake.POST");
  try {
    await compileTrust(request, { mode: "publicNonPersistent", reason: "free appraisal fulfillment" });
    await enforceRateLimit(request, intakeRateLimit);
    const body = await readCompiledJson(request);
    const intakeContext = cleanIntakeContext(body.intakeContext);

    const checkout = createFreeAppraisalSession(body, traceId);
    const paymentRequired = false;
    const existing = await loadExistingResult(checkout.projectId);
    if (existing) return NextResponse.json({ ok: true, traceId, reused: true, ...existing });

    const submittedCode = cleanCode(body.code || body.appCode);
    const repoUrl = cleanText(body.repoUrl || body.repositoryUrl || body.repository, 260);
    const repositorySource = repoUrl
      ? await withStep("appraisal-intake.POST", traceId, "load public GitHub repository source", () =>
        loadPublicGitHubRepositorySource({ repositoryUrl: repoUrl, maxChars: MAX_APPRAISAL_CODE_LENGTH, maxFiles: 90, maxFileBytes: 120_000 }), 25_000)
      : null;
    const code = sourceCodeForAppraisal(submittedCode, repositorySource);
    const appName = cleanText(body.appName || body.name || repoName(repoUrl) || "Software Asset", 90);
    const framework = cleanFramework(body.framework);
    if (code.length < 80) {
      return NextResponse.json({
        ok: false,
        traceId,
        error: "Paste or upload at least 80 characters of source code for the appraisal.",
      }, { status: 400 });
    }

    const db = getPrisma();
    const userId = db ? await ensureCheckoutUser(checkout.userId, checkout.ownerEmail) : checkout.userId;
    if (paymentRequired && db) {
      await withStep("appraisal-intake.POST", traceId, "record checkout entitlement", () =>
        recordPaidAppraisalPayment({
          sessionId: checkout.sessionId,
          userId,
          ownerEmail: checkout.ownerEmail,
          customerEmail: checkout.purchaserEmail,
          projectId: checkout.projectId,
          offerId: checkout.offer.id,
          amount: checkout.payment.amountTotal,
          currency: checkout.payment.currency,
          stripePaymentId: checkout.payment.paymentIntentId,
          stripeCustomerId: checkout.payment.customerId,
          traceId,
          metadata: {
            source: "appraisal_intake",
            priceId: checkout.payment.priceId,
          },
        }), 15_000);
      await withStep("appraisal-intake.POST", traceId, "transition checkout to intake received", () =>
        transitionPaidAppraisalPayment({
          sessionId: checkout.sessionId,
          event: "intake.received",
          traceId,
          metadata: { intakeCompleteness: intakeContext.intakeCompleteness || null },
        }), 10_000);
    }

    if (db) {
      await persistProject(projectRecordFor({
        projectId: checkout.projectId,
        appName,
        repoUrl,
        offerId: checkout.offer.id,
        purchaserEmail: checkout.purchaserEmail,
        receiptEmail: checkout.receiptEmail,
        contactEmail: checkout.contactEmail,
        intakeContext,
        createdAt: new Date().toISOString(),
      }), userId);
    }

    if (paymentRequired && db) {
      await withStep("appraisal-intake.POST", traceId, "transition checkout to scanning", () =>
        transitionPaidAppraisalPayment({ sessionId: checkout.sessionId, event: "scan.started", traceId }), 10_000);
    }

    const analysis = await withStep("appraisal-intake.POST", traceId, "scan submitted software evidence", () =>
      ventureOSIntelligenceService.analyze({
        projectId: checkout.projectId,
        appCode: code,
        framework,
        modules: modulesFor(body.modules, repoUrl),
        appMetadata: sanitizeMetadata({
          source: paymentRequired ? "paid_appraisal_intake" : "free_appraisal_intake",
          inputSource: repositorySource ? "public_github_repository" : "submitted_source",
          rawCodeStored: false,
          checkoutSessionId: checkout.sessionId,
          offerId: checkout.offer.id,
          paymentAmount: checkout.payment.amountTotal,
          paymentCurrency: checkout.payment.currency,
          repositoryHash: repoUrl ? hashValue(repoUrl) : null,
          intakeContext,
          repositorySource: repositorySource ? {
            provider: "github",
            repositoryHash: hashValue(repositorySource.canonicalUrl),
            ref: repositorySource.ref,
            filesLoaded: repositorySource.filesLoaded,
            totalFilesDiscovered: repositorySource.totalFilesDiscovered,
            truncated: repositorySource.truncated,
          } : null,
          codeHash: hashValue(code),
        }),
        validationResults: {
          paidAppraisal: paymentRequired ? "checkout_verified" : "free_access",
          rawCodeStored: false,
          inputLength: code.length,
          repositorySource: repositorySource ? "public_github_loaded" : "not_used",
          repositoryFilesLoaded: repositorySource?.filesLoaded || 0,
          repositoryInputTruncated: repositorySource?.truncated || false,
        },
      }), 30_000);
    if (paymentRequired && db) {
      await withStep("appraisal-intake.POST", traceId, "transition checkout to appraising", () =>
        transitionPaidAppraisalPayment({
          sessionId: checkout.sessionId,
          event: "scan.completed",
          traceId,
          metadata: {
            analysisId: analysis.analysisId,
            readinessScore: analysis.productionReadinessScore,
            riskLevel: analysis.riskLevel,
            issueCount: analysis.issues.length,
          },
        }), 10_000);
    }

    if (!db) {
      return NextResponse.json(createFreeAppraisalResult({
        traceId,
        checkout,
        analysis,
        appName,
        repoUrl,
        code,
        repositorySource,
      }), { status: 201 });
    }

    const appraisal = await withStep("appraisal-intake.POST", traceId, "create software appraisal", () =>
      createSoftwareAppraisal({ projectId: checkout.projectId, userId }), 15_000);
    if (paymentRequired && db) {
      await withStep("appraisal-intake.POST", traceId, "transition checkout to certifying", () =>
        transitionPaidAppraisalPayment({
          sessionId: checkout.sessionId,
          event: "appraisal.completed",
          traceId,
          metadata: {
            appraisalId: appraisal.id,
            appraisalPublicId: appraisal.publicId,
          },
        }), 10_000);
    }

    const certificate = await withStep("appraisal-intake.POST", traceId, "issue signed certificate", () =>
      issueCertificateForAppraisal({ appraisalIdOrPublicId: appraisal.id, userId }), 15_000);
    if (paymentRequired && db) {
      await withStep("appraisal-intake.POST", traceId, "transition checkout to certificate issued", () =>
        transitionPaidAppraisalPayment({
          sessionId: checkout.sessionId,
          event: "certificate.issued",
          traceId,
          metadata: {
            appraisalId: appraisal.id,
            appraisalPublicId: appraisal.publicId,
            certificateId: certificate.certificateId,
          },
        }), 10_000);

      await withStep("appraisal-intake.POST", traceId, "mark checkout fulfilled", () =>
        markPaidAppraisalPaymentFulfilled({
          sessionId: checkout.sessionId,
          userId,
          projectId: checkout.projectId,
          appraisalId: appraisal.id,
          appraisalPublicId: appraisal.publicId,
          certificateId: certificate.certificateId,
          traceId,
        }), 15_000);
    }

    return NextResponse.json({
      ok: true,
      traceId,
      checkout: { sessionId: checkout.sessionId, offer: checkout.offer, free: checkout.free },
      scan: {
        analysisId: analysis.analysisId,
        readinessScore: analysis.productionReadinessScore,
        riskLevel: analysis.riskLevel,
        issueCount: analysis.issues.length,
        source: repositorySource ? {
          type: "public_github_repository",
          canonicalUrl: repositorySource.canonicalUrl,
          ref: repositorySource.ref,
          filesLoaded: repositorySource.filesLoaded,
          totalFilesDiscovered: repositorySource.totalFilesDiscovered,
          truncated: repositorySource.truncated,
          warnings: repositorySource.warnings,
        } : {
          type: "submitted_source",
          inputLength: code.length,
        },
        externalIntelligence: {
          sources: analysis.externalIntelligence.sources,
          vulnerabilityCount: analysis.externalIntelligence.vulnerabilities.length,
          limitations: analysis.externalIntelligence.limitations.slice(0, 5),
        },
      },
      appraisal,
      certificate,
    }, { status: 201 });
  } catch (error) {
    return errorResponse("appraisal-intake.POST", traceId, error, statusForIntakeError(error));
  }
}

async function verifyPaidAppraisalSession(sessionId: string, traceId: string) {
  const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["line_items.data.price"] });
  const rawOfferId = String(session.metadata?.offerId || "");
  const offer = appraisalOfferFor(rawOfferId);
  const price = firstLineItemPrice(session);
  const expectedPriceId = stripePriceIdForAppraisalOffer(offer) || cleanMetadataValue(session.metadata?.expectedPriceId, "inline");
  const amountTotal = numberOrNull(session.amount_total);
  const currency = String(session.currency || price?.currency || "").toLowerCase();
  const failures = [];

  if (session.mode !== "payment") failures.push("mode");
  if (session.payment_status !== "paid") failures.push("payment_status");
  if (session.metadata?.product !== "ventureos_appraisal") failures.push("product");
  if (rawOfferId !== offer.id) failures.push("offer");
  if (amountTotal !== offer.unitAmount) failures.push("amount_total");
  if (currency !== "usd") failures.push("currency");
  if (expectedPriceId && expectedPriceId !== "inline" && price?.id !== expectedPriceId) failures.push("price_id");

  const email = session.customer_details?.email || session.customer_email || "";
  if (!email) failures.push("customer_email");
  if (failures.length > 0) {
    trace("appraisal-intake.POST", "stripe payment validation failed", {
      traceId,
      sessionId: safeStripeSessionId(session.id),
      failures,
      offerId: rawOfferId || null,
      amountTotal,
      currency,
      expectedAmount: offer.unitAmount,
      expectedPriceConfigured: expectedPriceId && expectedPriceId !== "inline",
      actualPriceId: price?.id || null,
    });
    throw new Error(`PAYMENT_VALIDATION_FAILED: ${failures.join(",")}`);
  }

  trace("appraisal-intake.POST", "stripe payment validation passed", {
    traceId,
    sessionId: safeStripeSessionId(session.id),
    offerId: offer.id,
    amountTotal,
    currency,
    priceValidated: Boolean(expectedPriceId && expectedPriceId !== "inline"),
  });
  const checkoutKey = session.id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 72);
  const ownerEmail = `checkout-${hashValue(session.id).slice(0, 24)}@ventureos.local`;
  return {
    sessionId: session.id,
    userId: `stripe-checkout-${checkoutKey}`,
    ownerEmail,
    projectId: `paid-appraisal-${checkoutKey}`,
    purchaserEmail: email,
    receiptEmail: email,
    contactEmail: email,
    offer,
    payment: {
      amountTotal: amountTotal ?? 0,
      currency,
      priceId: price?.id || null,
      paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      customerId: typeof session.customer === "string" ? session.customer : null,
    },
    free: false,
  };
}

function createFreeAppraisalSession(body: Record<string, unknown>, traceId: string) {
  const offer = appraisalOfferFor(body.offer || body.offerId);
  const seed = [
    traceId,
    cleanText(body.email, 180),
    cleanText(body.appName || body.name, 120),
    cleanText(body.repoUrl || body.repositoryUrl || body.repository, 260),
    Date.now().toString(),
  ].join(":");
  const key = hashValue(seed).slice(0, 24);
  const email = cleanEmail(body.email) || `free-appraisal-${key}@ventureos.local`;
  return {
    sessionId: `free-${key}`,
    userId: `free-appraisal-${key}`,
    ownerEmail: email,
    projectId: `free-appraisal-${key}`,
    purchaserEmail: email,
    receiptEmail: email,
    contactEmail: email,
    offer,
    payment: {
      amountTotal: 0,
      currency: "usd",
      priceId: null,
      paymentIntentId: null,
      customerId: null,
    },
    free: true,
  };
}

function createFreeAppraisalResult(input: {
  traceId: string;
  checkout: ReturnType<typeof createFreeAppraisalSession>;
  analysis: {
    analysisId?: string;
    productionReadinessScore?: number;
    riskLevel?: string;
    issues?: Array<{ title?: string; severity?: string }>;
    externalIntelligence?: {
      sources?: unknown[];
      vulnerabilities?: unknown[];
      limitations?: string[];
    };
  };
  appName: string;
  repoUrl: string;
  code: string;
  repositorySource: PublicGitHubRepositorySource | null;
}) {
  const origin = canonicalAppUrl().replace(/\/+$/, "");
  const score = Math.max(0, Math.min(100, Math.round(Number(input.analysis.productionReadinessScore || 0))));
  const publicId = `VOS-FREE-${hashValue(`${input.checkout.projectId}:${input.analysis.analysisId || input.code}`).slice(0, 12).toUpperCase()}`;
  const certificateId = `vos-free-${hashValue(publicId).slice(0, 16)}`;
  const issueCount = Array.isArray(input.analysis.issues) ? input.analysis.issues.length : 0;
  const filesLoaded = input.repositorySource?.filesLoaded || 0;
  const verifiedClaims = [
    input.repositorySource ? `Public GitHub repository loaded with ${filesLoaded} source file(s).` : "Submitted source code was analyzed.",
    `Readiness scan completed with ${issueCount} returned issue(s).`,
    "Free launch-mode report generated without payment.",
  ];
  const unknowns = [
    "Independent production access was not verified.",
    "Private environment variables and secrets were not inspected.",
    "Revenue, user counts, and ownership claims require external confirmation.",
  ];
  const unverifiedClaims = [
    "This is not a legal, SOC 2, financial, or independent audit certification.",
    "The Signed Verification Badge is evidence-scoped to submitted source only.",
  ];
  const grade = score >= 85 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : "Review";
  const launchVerdict = score >= 80 ? "READY WITH STANDARD REVIEW" : score >= 65 ? "REVIEW BEFORE LAUNCH" : "REMEDIATION RECOMMENDED";

  return {
    ok: true,
    traceId: input.traceId,
    transient: true,
    checkout: { sessionId: input.checkout.sessionId, offer: input.checkout.offer, free: true },
    scan: {
      analysisId: input.analysis.analysisId || publicId,
      readinessScore: score,
      riskLevel: String(input.analysis.riskLevel || "unknown"),
      issueCount,
      source: input.repositorySource ? {
        type: "public_github_repository",
        canonicalUrl: input.repositorySource.canonicalUrl,
        ref: input.repositorySource.ref,
        filesLoaded: input.repositorySource.filesLoaded,
        totalFilesDiscovered: input.repositorySource.totalFilesDiscovered,
        truncated: input.repositorySource.truncated,
        warnings: input.repositorySource.warnings,
      } : {
        type: "submitted_source",
        inputLength: input.code.length,
      },
      externalIntelligence: {
        sources: input.analysis.externalIntelligence?.sources || [],
        vulnerabilityCount: input.analysis.externalIntelligence?.vulnerabilities?.length || 0,
        limitations: (input.analysis.externalIntelligence?.limitations || []).slice(0, 5),
      },
    },
    appraisal: {
      id: publicId,
      publicId,
      appName: input.appName,
      appraisalUrl: `${origin}/sample-appraisal`,
      certificateUrl: `${origin}/certificate/${encodeURIComponent(certificateId)}`,
      badgeUrl: `${origin}/api/certificates/${encodeURIComponent(certificateId)}/badge.svg`,
      badgeEmbedHtml: `<a href="${origin}/certificate/${certificateId}" rel="noopener" target="_blank"><img src="${origin}/api/certificates/${certificateId}/badge.svg" alt="VentureOS free verified report badge" /></a>`,
      grade,
      launchVerdict,
      readinessScore: score,
      publicSummary: {
        evidenceCoverage: {
          score: input.repositorySource ? 72 : 58,
          level: input.repositorySource ? "repository sample" : "submitted source",
          scope: input.repositorySource ? "Public repository evidence" : "Pasted/uploaded source evidence",
          scoreCap: input.repositorySource ? 85 : 75,
          scoreCapped: score > (input.repositorySource ? 85 : 75),
          verifiedClaims,
          unknowns,
          unverifiedClaims,
        },
        unknowns,
        unverifiedClaims,
        technicalValue: {
          available: false,
          label: "Not claimed",
          basis: "No verified valuation dataset is configured for free launch reports.",
        },
      },
    },
    certificate: {
      certificateId,
      verificationUrl: `${origin}/certificate/${encodeURIComponent(certificateId)}`,
      badgeUrl: `${origin}/api/certificates/${encodeURIComponent(certificateId)}/badge.svg`,
    },
  };
}

async function loadExistingResult(projectId: string) {
  const db = getPrisma();
  if (!db) return null;
  const appraisal = await db.softwareAppraisal.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      publicId: true,
      grade: true,
      launchVerdict: true,
      readinessScore: true,
    },
  });
  if (!appraisal) return null;
  const certificate = await loadLatestPublicCertificateForAppraisal(appraisal.publicId);
  const origin = canonicalAppUrl();
  return {
    appraisal: {
      ...appraisal,
      certificateUrl: `${origin.replace(/\/+$/, "")}/appraisal/${encodeURIComponent(appraisal.publicId)}`,
    },
    certificate,
  };
}

async function ensureCheckoutUser(userId: string, email: string) {
  const db = getPrisma();
  if (!db) throw new Error("Database is required for appraisals.");
  const existingById = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (existingById) return existingById.id;
  const existingByEmail = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingByEmail) return existingByEmail.id;

  const created = await db.user.create({
    data: { id: userId, email, plan: "founder" },
    select: { id: true },
  });
  return created.id;
}

function projectRecordFor(input: {
  projectId: string;
  appName: string;
  repoUrl: string;
  offerId: string;
  purchaserEmail: string;
  receiptEmail: string;
  contactEmail: string;
  intakeContext: Record<string, unknown>;
  createdAt: string;
}): ProjectRecord {
  const context = input.intakeContext;
  const purpose = cleanText(context.appraisalPurpose, 80) || "appraisal";
  const stage = cleanText(context.assetStage, 80) || "unknown stage";
  const company = cleanText(context.companyName, 90);
  const role = cleanText(context.contactRole, 80);
  const criticalSystems = cleanText(context.criticalSystems, 180);
  return {
    id: input.projectId,
    name: input.appName,
    slug: input.projectId,
    category: "software-appraisal",
    problem: `Determine whether this ${stage} software asset is safe for ${purpose}.`,
    audience: role || "software founders, buyers, investors, agencies, and technical reviewers",
    uiDirection: "evidence-backed appraisal",
    monetization: `${input.offerId} appraisal`,
    prompt: input.repoUrl
      ? `VentureOS appraisal for ${input.appName}${company ? ` owned by ${company}` : ""} from repository context ${input.repoUrl}. Critical systems: ${criticalSystems || "not specified"}.`
      : `VentureOS appraisal for ${input.appName}${company ? ` owned by ${company}` : ""}. Critical systems: ${criticalSystems || "not specified"}.`,
    status: "ready",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    files: [],
    onboarding: ["Launch access granted", "Source evidence submitted", "Scanner executed", "Certificate issued"],
    features: ["Readiness score", "Risk evidence", "Repair estimate", "Signed certificate", "Public badge"],
    appraisalContact: {
      purchaserEmail: input.purchaserEmail,
      receiptEmail: input.receiptEmail,
      contactEmail: input.contactEmail,
      source: "free_access",
      intakeContext: input.intakeContext,
    },
    qa: {
      score: 0,
      threshold: 85,
      releaseApproved: false,
      issues: [],
      blockers: [],
      simulatedUsers: [],
      productionQuestions: {
        wouldSomeonePay: true,
        wouldEmbarrassFounder: false,
        survivesRealUsers: false,
        feelsPremiumBesideSaaS: true,
      },
      dimensions: {},
    },
  };
}

function stripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("Missing required env var: STRIPE_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2026-05-27.dahlia" });
}

function cleanCode(value: unknown) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .slice(0, MAX_APPRAISAL_CODE_LENGTH);
}

function sourceCodeForAppraisal(submittedCode: string, repositorySource: PublicGitHubRepositorySource | null) {
  if (!repositorySource) return submittedCode;
  const manual = submittedCode.trim();
  if (!manual) return repositorySource.code;
  return `${repositorySource.code}\n\n// FILE: submitted-additional-context.txt\n${manual}`.slice(0, MAX_APPRAISAL_CODE_LENGTH);
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanFramework(value: unknown) {
  const clean = String(value || "nextjs").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  return clean || "nextjs";
}

function cleanEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.slice(0, 180) : "";
}

function modulesFor(value: unknown, repoUrl: string) {
  const modules = Array.isArray(value) ? value.map(String) : [];
  if (/github/i.test(repoUrl)) modules.push("github");
  return [...new Set(["appraisal", ...modules].map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

function cleanIntakeContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return sanitizeMetadata({
    companyName: cleanText(record.companyName, 100),
    website: cleanUrlish(record.website, 220),
    contactRole: cleanText(record.contactRole, 80),
    appraisalPurpose: cleanText(record.appraisalPurpose, 80),
    assetStage: cleanText(record.assetStage, 80),
    revenueStatus: cleanText(record.revenueStatus, 80),
    deploymentTarget: cleanText(record.deploymentTarget, 80),
    activeUsers: cleanText(record.activeUsers, 80),
    criticalSystems: cleanText(record.criticalSystems, 240),
    knownConcerns: cleanText(record.knownConcerns, 2_000),
    deadline: cleanText(record.deadline, 120),
    evidenceChecklist: Array.isArray(record.evidenceChecklist)
      ? record.evidenceChecklist.map((item) => cleanText(item, 60)).filter(Boolean).slice(0, 20)
      : [],
    intakeCompleteness: Math.max(0, Math.min(100, Math.round(Number(record.intakeCompleteness || 0)))),
  });
}

function repoName(value: string) {
  const clean = value.replace(/\/+$/, "");
  const match = clean.match(/([^/\s]+\/[^/\s]+)$/);
  return match?.[1] || "";
}

function cleanUrlish(value: unknown, maxLength: number) {
  const raw = cleanText(value, maxLength);
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(raw)) return `https://${raw}`;
  return raw;
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function firstLineItemPrice(session: Stripe.Checkout.Session) {
  const lineItems = (session as Stripe.Checkout.Session & { line_items?: { data?: Array<{ price?: unknown }> } }).line_items?.data || [];
  const price = lineItems[0]?.price;
  if (!price || typeof price !== "object") return null;
  const record = price as { id?: unknown; unit_amount?: unknown; currency?: unknown };
  return {
    id: typeof record.id === "string" ? record.id : "",
    unitAmount: numberOrNull(record.unit_amount),
    currency: typeof record.currency === "string" ? record.currency.toLowerCase() : "",
  };
}

function numberOrNull(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanMetadataValue(value: unknown, fallback = "") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function safeStripeSessionId(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function statusForIntakeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/STRIPE_SECRET_KEY|Stripe|APP_URL|NEXT_PUBLIC_APP_URL|allowlisted|Database|CERTIFICATE_SIGNING_KEY_REQUIRED/.test(message)) return 503;
  if (/rate/i.test(message)) return 429;
  if (/PAYMENT_VALIDATION_FAILED|not a one-time|not been paid|not for a VentureOS appraisal|amount_total|currency|price_id|payment_status/i.test(message)) return 422;
  if (/checkout session is required|email|source code|appCode|required|public GitHub|repository could not be read|private repository|supported source files/i.test(message)) return 400;
  return 500;
}
