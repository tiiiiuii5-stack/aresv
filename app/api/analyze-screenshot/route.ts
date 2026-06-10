import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

import { enforceRateLimit, RATE_LIMITS } from "@/lib/security/backendSecurity";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const FALLBACK_COLORS = [
  { hex: "#0A0A0F", usage: "background" },
  { hex: "#6366F1", usage: "primary action" },
  { hex: "#10B981", usage: "success state" },
  { hex: "#F8FAFC", usage: "primary text" },
];

type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ScreenshotComponent = {
  type: string;
  bounds: Bounds;
  style?: Record<string, unknown>;
};

type ScreenshotAnalysis = {
  components: ScreenshotComponent[];
  colors: Array<{ hex: string; usage: string }>;
  layout: { type: "grid" | "flex" | "stack"; notes?: string };
  componentTree: Record<string, unknown>;
  suggestedArchitecture: string;
  nsfw: boolean;
  fallback: boolean;
};

export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit(request, RATE_LIMITS.screenshotAnalysis);
    await compileTrust(request, { mode: "session" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNAUTHORIZED";
    const status = /rate|too many/i.test(message) ? 429 : message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("image");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Upload an image file." }, { status: 400 });
  }

  if (!SUPPORTED_TYPES.has(file.type)) {
    return NextResponse.json({ ok: false, error: "Supported formats: PNG, JPG, WebP." }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ ok: false, error: "Screenshot must be 5MB or smaller." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const analysis = await analyzeWithGemini(buffer, file.type).catch((error) => fallbackAnalysis(error instanceof Error ? error.message : "Vision analysis failed."));

  return NextResponse.json({ ok: true, ...analysis });
}

async function analyzeWithGemini(buffer: Buffer, mimeType: string): Promise<ScreenshotAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) return fallbackAnalysis("Gemini API key is not configured.");

  const ai = new GoogleGenAI({ apiKey });
  const request = {
    model: process.env.GEMINI_VISION_MODEL || "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "Analyze this UI screenshot for a software generation engine.",
              "Return ONLY valid JSON.",
              "Detect UI components such as nav, sidebar, buttons, inputs, forms, cards, tables, charts, lists, modals, and preview panes.",
              "Use normalized bounds from 0 to 1: { x, y, width, height }.",
              "Extract a concise color palette with usage labels.",
              "Identify layout as grid, flex, or stack.",
              "Generate a componentTree JSON object and a suggestedArchitecture string that can seed a runtime-factory.json.",
              "If unsafe or adult content is visible, set nsfw true.",
              'Shape: {"components":[{"type":"button","bounds":{"x":0.1,"y":0.2,"width":0.2,"height":0.06},"style":{"color":"#6366F1","role":"primary action"}}],"colors":[{"hex":"#000000","usage":"background"}],"layout":{"type":"grid","notes":"..."},"componentTree":{},"suggestedArchitecture":"...","nsfw":false}',
            ].join("\n"),
          },
          {
            inlineData: {
              mimeType,
              data: buffer.toString("base64"),
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  } satisfies Parameters<typeof ai.models.generateContent>[0];

  const response = await ai.models.generateContent(request);
  const safety = response as unknown as {
    promptFeedback?: { blockReason?: string };
    candidates?: Array<{ finishReason?: string; safetyRatings?: Array<{ category?: string; probability?: string }> }>;
  };
  const blocked = Boolean(safety.promptFeedback?.blockReason) || safety.candidates?.some((candidate) => candidate.finishReason === "SAFETY");

  if (blocked) {
    return {
      ...fallbackAnalysis("Screenshot was blocked by safety filters."),
      nsfw: true,
    };
  }

  const parsed = parseGeminiJson(response.text || "{}");
  return normalizeAnalysis(parsed);
}

function parseGeminiJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const json = firstBrace >= 0 && lastBrace > firstBrace ? cleaned.slice(firstBrace, lastBrace + 1) : cleaned;
  return JSON.parse(json);
}

function normalizeAnalysis(value: unknown): ScreenshotAnalysis {
  const data = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const components = Array.isArray(data.components) ? data.components.map(normalizeComponent).filter(Boolean) as ScreenshotComponent[] : [];
  const colors = Array.isArray(data.colors)
    ? data.colors.map((color) => {
        const item = color && typeof color === "object" ? (color as Record<string, unknown>) : {};
        return { hex: normalizeHex(String(item.hex || "#6366F1")), usage: String(item.usage || "interface color") };
      })
    : FALLBACK_COLORS;
  const layoutValue = data.layout && typeof data.layout === "object" ? (data.layout as Record<string, unknown>) : {};
  const layoutType = ["grid", "flex", "stack"].includes(String(layoutValue.type)) ? String(layoutValue.type) as "grid" | "flex" | "stack" : "grid";

  return {
    components: components.length ? components.slice(0, 40) : fallbackComponents(),
    colors: colors.length ? colors.slice(0, 8) : FALLBACK_COLORS,
    layout: { type: layoutType, notes: String(layoutValue.notes || "Layout inferred from uploaded screenshot.") },
    componentTree: data.componentTree && typeof data.componentTree === "object" ? data.componentTree as Record<string, unknown> : { root: { children: components.map((component) => component.type) } },
    suggestedArchitecture: String(data.suggestedArchitecture || "Use the screenshot as a visual seed: preserve the detected layout zones, map each interactive control to a real API-backed action, and generate route-specific components."),
    nsfw: Boolean(data.nsfw),
    fallback: false,
  };
}

function normalizeComponent(value: unknown): ScreenshotComponent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const bounds = item.bounds && typeof item.bounds === "object" ? item.bounds as Record<string, unknown> : {};
  return {
    type: String(item.type || "section"),
    bounds: {
      x: clamp01(Number(bounds.x || 0)),
      y: clamp01(Number(bounds.y || 0)),
      width: clamp01(Number(bounds.width || 0.2)),
      height: clamp01(Number(bounds.height || 0.1)),
    },
    style: item.style && typeof item.style === "object" ? item.style as Record<string, unknown> : undefined,
  };
}

function fallbackAnalysis(reason: string): ScreenshotAnalysis {
  const components = fallbackComponents();
  return {
    components,
    colors: FALLBACK_COLORS,
    layout: { type: "grid", notes: `Fallback architecture generated because analysis failed: ${reason}` },
    componentTree: {
      shell: {
        layout: "grid",
        children: ["navigation", "primary-workspace", "actions-panel", "status-region"],
      },
    },
    suggestedArchitecture: "Fallback mode: build a real app from the text prompt, using the screenshot only as a visual reference. Preserve large layout zones, create real routes for each major region, and bind every detected action to API-backed state changes.",
    nsfw: false,
    fallback: true,
  };
}

function fallbackComponents(): ScreenshotComponent[] {
  return [
    { type: "nav", bounds: { x: 0.04, y: 0.04, width: 0.92, height: 0.09 }, style: { role: "top navigation" } },
    { type: "sidebar", bounds: { x: 0.04, y: 0.16, width: 0.22, height: 0.72 }, style: { role: "controls" } },
    { type: "canvas", bounds: { x: 0.3, y: 0.16, width: 0.46, height: 0.72 }, style: { role: "primary workspace" } },
    { type: "panel", bounds: { x: 0.79, y: 0.16, width: 0.17, height: 0.72 }, style: { role: "details" } },
    { type: "button", bounds: { x: 0.8, y: 0.8, width: 0.14, height: 0.06 }, style: { role: "primary action" } },
  ];
}

function normalizeHex(value: string) {
  const hex = value.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.toUpperCase() : "#6366F1";
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
