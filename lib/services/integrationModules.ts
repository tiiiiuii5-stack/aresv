import { getPrisma } from "@/lib/prisma";
import type { AppPlan } from "@/lib/app-planning-engine";
import type { ProjectFile } from "@/lib/project-store";
import { weakCategoryIntegrationModules } from "@/lib/services/weakIntegrationModules";

type TemplateFile = {
  path: string;
  content: string;
};

export type IntegrationModuleTemplate = {
  files: TemplateFile[];
  dependencies: string[];
  env?: string[];
};

export type IntegrationModuleDefinition = {
  name: string;
  version?: string;
  category: string;
  description: string;
  codeTemplate: IntegrationModuleTemplate;
  testCases: Array<{ input: string; expectedOutput: string }>;
  validationScore: number;
  immutable?: boolean;
  humanReviewedAt?: string | null;
};

export type AppliedIntegrationModule = {
  name: string;
  version?: string;
  category: string;
  description: string;
  validationScore: number;
  immutable?: boolean;
  dependencies: string[];
  files: string[];
};

export class IntegrationModuleService {
  async listModules() {
    const db = getPrisma();
    if (!db) return allIntegrationModules;
    const rows = await db.integrationModule.findMany({
      orderBy: [{ category: "asc" }, { validationScore: "desc" }],
    });
    return rows.map((row) => ({
      name: row.name,
      version: row.version,
      category: row.category,
      description: row.description,
      codeTemplate: row.codeTemplate as IntegrationModuleTemplate,
      testCases: row.testCases as Array<{ input: string; expectedOutput: string }>,
      validationScore: row.validationScore,
      immutable: row.immutable,
      humanReviewedAt: row.humanReviewedAt?.toISOString() || null,
    }));
  }

  async seedDefaults() {
    const db = getPrisma();
    if (!db) return { seeded: 0, skipped: allIntegrationModules.length, skippedImmutable: 0 };

    let seeded = 0;
    let skippedImmutable = 0;
    const allowReviewedUpdate = process.env.HUMAN_REVIEWED_MODULE_UPDATE === "true";
    for (const integration of allIntegrationModules) {
      const existing = await db.integrationModule.findUnique({ where: { name: integration.name } });
      if (existing?.immutable && !allowReviewedUpdate) {
        skippedImmutable += 1;
        continue;
      }
      if (existing) {
        await db.integrationModule.update({
          where: { name: integration.name },
          data: {
            version: integration.version || "1.0.0",
            category: integration.category,
            description: integration.description,
            codeTemplate: integration.codeTemplate,
            testCases: integration.testCases,
            validationScore: integration.validationScore,
            immutable: integration.immutable ?? true,
            humanReviewedAt: new Date(),
          },
        });
      } else {
        await db.integrationModule.create({
          data: {
            name: integration.name,
            version: integration.version || "1.0.0",
            category: integration.category,
            description: integration.description,
            codeTemplate: integration.codeTemplate,
            testCases: integration.testCases,
            validationScore: integration.validationScore,
            immutable: integration.immutable ?? true,
          },
        });
      }
      seeded += 1;
    }
    return { seeded, skipped: 0, skippedImmutable };
  }

  async validateSeededModules() {
    return this.validateModules(await this.listModules());
  }

  validateModules(modules: IntegrationModuleDefinition[] = allIntegrationModules) {
    return modules.map((integration) => {
      const issues: string[] = [];
      if (!integration.version) issues.push("missing version");
      if (integration.immutable !== true) issues.push("module core must be immutable");
      if (!integration.codeTemplate.files.length) issues.push("missing codeTemplate files");
      if (!integration.testCases.length) issues.push("missing test cases");
      for (const file of integration.codeTemplate.files) {
        if (!file.path || !file.content.trim()) issues.push(`invalid template file: ${file.path || "unknown"}`);
      }
      return {
        name: integration.name,
        version: integration.version || "1.0.0",
        category: integration.category,
        passed: issues.length === 0,
        files: integration.codeTemplate.files.length,
        tests: integration.testCases.length,
        validationScore: integration.validationScore,
        immutable: integration.immutable === true,
        issues,
      };
    });
  }

  async modulesForPrompt(prompt: string, plan: AppPlan): Promise<IntegrationModuleDefinition[]> {
    const categories = this.detectCategories(prompt, plan);
    if (!categories.length) return [];

    const db = getPrisma();
    if (db) {
      const rows = await db.integrationModule.findMany({
        where: { category: { in: categories } },
        orderBy: [{ validationScore: "desc" }, { usageCount: "desc" }],
        take: categories.length,
      });
      if (rows.length) {
        await db.integrationModule.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: { usageCount: { increment: 1 } },
        });
        return rows.map((row) => ({
          name: row.name,
          version: row.version,
          category: row.category,
          description: row.description,
          codeTemplate: row.codeTemplate as IntegrationModuleTemplate,
          testCases: row.testCases as Array<{ input: string; expectedOutput: string }>,
          validationScore: row.validationScore,
          immutable: row.immutable,
          humanReviewedAt: row.humanReviewedAt?.toISOString() || null,
        }));
      }
    }

    return allIntegrationModules.filter((integration) => categories.includes(integration.category));
  }

  applyModules(files: ProjectFile[], modules: IntegrationModuleDefinition[]): { files: ProjectFile[]; applied: AppliedIntegrationModule[] } {
    if (!modules.length) return { files, applied: [] };

    let nextFiles = [...files];
    for (const integration of modules) {
      nextFiles = mergeTemplateFiles(nextFiles, integration);
      nextFiles = mergePackageDependencies(nextFiles, integration.codeTemplate.dependencies);
    }

    const applied = modules.map((integration) => ({
      name: integration.name,
      version: integration.version || "1.0.0",
      category: integration.category,
      description: integration.description,
      validationScore: integration.validationScore,
      immutable: integration.immutable ?? true,
      dependencies: integration.codeTemplate.dependencies,
      files: integration.codeTemplate.files.map((file) => file.path),
    }));

    nextFiles = upsertJsonFile(nextFiles, "architecture/integration-modules.json", {
      mode: "module-assisted",
      immutableCore: true,
      updatePolicy: "AI may compose around module APIs, but cannot modify module core logic. Module updates require human review.",
      modules: applied,
      validation: modules.flatMap((integration) => integration.testCases),
    });
    nextFiles = updateRuntimeFactory(nextFiles, applied);

    return { files: nextFiles, applied };
  }

  private detectCategories(prompt: string, plan: AppPlan) {
    const promptText = prompt.toLowerCase();
    const text = `${prompt} ${plan.category} ${plan.features.join(" ")} ${plan.apiEndpoints.map((endpoint) => endpoint.path).join(" ")}`.toLowerCase();
    const categories = new Set<string>();

    if (plan.category === "ecommerce" || /\b(stripe|checkout|cart|order|payment|inventory|storefront)\b/.test(text)) {
      categories.add("ecommerce");
    }
    if (/\b(booking|calendar|appointment|availability|timeslot|ics|rrule|recurring)\b/.test(promptText)) {
      categories.add("booking");
    }
    if (/\b(video|streaming|hls|ffmpeg|ffmpeg\.wasm|transcod|cdn|multipart|upload|thumbnail)\b/.test(promptText)) {
      categories.add(/\b(ffmpeg\.wasm|thumbnail|client-side)\b/.test(promptText) ? "video-transcode" : "video");
    }
    if (/\b(gantt|dependency|dependencies|project plan|timeline|reschedul|milestone)\b/.test(promptText)) {
      categories.add("project");
    }
    if (/\b(game|physics|matter\.js|cannon|collision|sprite|score|keyboard|touch input|requestanimationframe)\b/.test(promptText)) {
      categories.add("game");
    }
    if (/\b(crypto|wallet|ethers|web3|polygon|mainnet|balance|transaction history|network switching)\b/.test(promptText)) {
      categories.add("crypto");
    }
    if (/\b(email|smtp|imap|nodemailer|mailparser|attachment|thread|inbox)\b/.test(promptText)) {
      categories.add("email");
    }

    return [...categories];
  }
}

function mergeTemplateFiles(files: ProjectFile[], integration: IntegrationModuleDefinition) {
  const existing = new Map(files.map((file) => [file.path, file]));
  for (const file of integration.codeTemplate.files) {
    existing.set(file.path, {
      path: file.path,
      content: `// Integration module: ${integration.name}\n// Version: ${integration.version || "1.0.0"}\n// Immutable core: ${integration.immutable ?? true}\n${file.content.trim()}\n`,
    });
  }
  return [...existing.values()];
}

function mergePackageDependencies(files: ProjectFile[], dependencies: string[]) {
  if (!dependencies.length) return files;
  return files.map((file) => {
    if (file.path !== "package.json") return file;
    const pkg = JSON.parse(file.content) as { dependencies?: Record<string, string> };
    pkg.dependencies = { ...(pkg.dependencies || {}) };
    for (const dependency of dependencies) {
      const { name, version } = parseDependencySpec(dependency);
      if (name) pkg.dependencies[name] = version;
    }
    return { ...file, content: JSON.stringify(pkg, null, 2) };
  });
}

function parseDependencySpec(spec: string) {
  if (spec.startsWith("@")) {
    const versionIndex = spec.indexOf("@", 1);
    if (versionIndex === -1) return { name: spec, version: "latest" };
    return { name: spec.slice(0, versionIndex), version: spec.slice(versionIndex + 1) || "latest" };
  }
  const versionIndex = spec.lastIndexOf("@");
  if (versionIndex <= 0) return { name: spec, version: "latest" };
  return { name: spec.slice(0, versionIndex), version: spec.slice(versionIndex + 1) || "latest" };
}

function upsertJsonFile(files: ProjectFile[], path: string, value: unknown) {
  const content = JSON.stringify(value, null, 2);
  const index = files.findIndex((file) => file.path === path);
  if (index === -1) return [...files, { path, content }];
  return files.map((file, fileIndex) => (fileIndex === index ? { ...file, content } : file));
}

function updateRuntimeFactory(files: ProjectFile[], applied: AppliedIntegrationModule[]) {
  return files.map((file) => {
    if (file.path !== "architecture/runtime-factory.json") return file;
    const value = JSON.parse(file.content) as Record<string, unknown>;
    return {
      ...file,
      content: JSON.stringify(
        {
          ...value,
          generationMode: "module-assisted",
          integrationModules: applied,
          moduleInjection: {
            stage: "before-generation",
            rule: "Detected category modules are injected into the isolated runtime factory before code validation.",
            immutableCore: true,
            aiBoundary: "AI fills UI, branding, orchestration, and app-specific logic around module APIs without changing module core files.",
            updatePolicy: "Module updates require human review.",
          },
        },
        null,
        2,
      ),
    };
  });
}

export const integrationModuleService = new IntegrationModuleService();

export const defaultIntegrationModules: IntegrationModuleDefinition[] = [
  {
    name: "Ecommerce-Stripe",
    category: "ecommerce",
    description: "Stripe checkout session, webhook payment confirmation, cart state, and order confirmation email.",
    validationScore: 97,
    codeTemplate: {
      dependencies: ["stripe@^22.2.0", "zustand@^5.0.13"],
      env: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_APP_URL", "EMAIL_FROM"],
      files: [
        {
          path: "integrations/ecommerce-stripe/checkout.ts",
          content: `
import Stripe from "stripe";

export type CartLine = { productId: string; name: string; quantity: number; unitAmount: number };

export async function createStripeCheckoutSession(lines: CartLine[], orderId: string) {
  const stripe = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
  return stripe.checkout.sessions.create({
    mode: "payment",
    metadata: { orderId },
    success_url: \`\${requiredEnv("NEXT_PUBLIC_APP_URL")}/checkout/success?order=\${orderId}\`,
    cancel_url: \`\${requiredEnv("NEXT_PUBLIC_APP_URL")}/cart\`,
    line_items: lines.map((line) => ({
      quantity: line.quantity,
      price_data: {
        currency: "usd",
        unit_amount: line.unitAmount,
        product_data: { name: line.name },
      },
    })),
  });
}

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(\`Missing required env var: \${key}\`);
  return value;
}
`,
        },
        {
          path: "app/api/stripe/webhook/route.ts",
          content: `
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  const stripe = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  const event = stripe.webhooks.constructEvent(await request.text(), signature, requiredEnv("STRIPE_WEBHOOK_SECRET"));
  if (event.type === "payment_intent.succeeded") {
    const payment = event.data.object as Stripe.PaymentIntent;
    return NextResponse.json({ ok: true, orderStatus: "paid", paymentId: payment.id });
  }
  return NextResponse.json({ ok: true, ignored: event.type });
}

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(\`Missing required env var: \${key}\`);
  return value;
}
`,
        },
        {
          path: "integrations/ecommerce-stripe/cart-store.ts",
          content: `
import { create } from "zustand";

export type CartItem = { productId: string; name: string; quantity: number; unitAmount: number };

export const useCartStore = create<{
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
}>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: mergeItem(state.items, item) })),
  updateQuantity: (productId, quantity) =>
    set((state) => ({ items: state.items.map((item) => (item.productId === productId ? { ...item, quantity } : item)).filter((item) => item.quantity > 0) })),
  clear: () => set({ items: [] }),
}));

function mergeItem(items: CartItem[], next: CartItem) {
  const existing = items.find((item) => item.productId === next.productId);
  if (!existing) return [...items, next];
  return items.map((item) => (item.productId === next.productId ? { ...item, quantity: item.quantity + next.quantity } : item));
}
`,
        },
        {
          path: "integrations/ecommerce-stripe/order-email.ts",
          content: `
export function orderConfirmationEmail(input: { orderId: string; customerName: string; total: string }) {
  return {
    subject: \`Order \${input.orderId} confirmed\`,
    text: \`Hi \${input.customerName}, your order total \${input.total} is confirmed and is now being prepared.\`,
  };
}
`,
        },
      ],
    },
    testCases: [
      { input: "cart with two line items", expectedOutput: "checkout session contains two Stripe line_items" },
      { input: "payment_intent.succeeded webhook", expectedOutput: "orderStatus is paid" },
    ],
  },
  {
    name: "Video-Streaming",
    category: "video",
    description: "Multipart upload endpoint, FFmpeg transcoding job, HLS playlist generation, and CDN URL delivery.",
    validationScore: 96,
    codeTemplate: {
      dependencies: ["bullmq@^5.77.3"],
      env: ["VIDEO_CDN_BASE_URL", "REDIS_URL"],
      files: [
        {
          path: "app/api/video/upload/route.ts",
          content: `
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing video file" }, { status: 400 });
  if (!file.type.startsWith("video/")) return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  const assetId = crypto.randomUUID();
  return NextResponse.json({ assetId, status: "queued", filename: file.name, bytes: file.size });
}
`,
        },
        {
          path: "integrations/video-streaming/transcode-job.ts",
          content: `
export type TranscodeInput = { assetId: string; sourcePath: string; renditions?: number[] };

export function createFfmpegCommands(input: TranscodeInput) {
  const renditions = input.renditions || [360, 720, 1080];
  return renditions.map((height) => ({
    height,
    command: \`ffmpeg -i \${input.sourcePath} -vf scale=-2:\${height} -hls_time 6 -hls_playlist_type vod public/hls/\${input.assetId}/\${height}p.m3u8\`,
  }));
}
`,
        },
        {
          path: "integrations/video-streaming/hls-playlist.ts",
          content: `
export function masterPlaylist(assetId: string, renditions = [360, 720, 1080]) {
  return renditions
    .map((height) => \`#EXT-X-STREAM-INF:BANDWIDTH=\${height * 1400},RESOLUTION=1280x\${height}\\n\${height}p.m3u8\`)
    .join("\\n");
}

export function cdnUrl(assetId: string) {
  const base = process.env.VIDEO_CDN_BASE_URL || "/hls";
  return \`\${base}/\${assetId}/master.m3u8\`;
}
`,
        },
      ],
    },
    testCases: [
      { input: "mp4 upload", expectedOutput: "asset queued for transcoding" },
      { input: "three renditions", expectedOutput: "master playlist includes three streams" },
    ],
  },
  {
    name: "Project-Gantt",
    category: "project",
    description: "Task dependency graph, date calculation engine, canvas renderer, and drag-and-drop rescheduling.",
    validationScore: 95,
    codeTemplate: {
      dependencies: [],
      files: [
        {
          path: "integrations/project-gantt/dependency-graph.ts",
          content: `
export type GanttTask = { id: string; title: string; start: string; durationDays: number; dependsOn: string[] };

export function topologicalTaskOrder(tasks: GanttTask[]) {
  const visited = new Set<string>();
  const ordered: GanttTask[] = [];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  function visit(task: GanttTask) {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    for (const dependency of task.dependsOn) {
      const parent = byId.get(dependency);
      if (parent) visit(parent);
    }
    ordered.push(task);
  }
  tasks.forEach(visit);
  return ordered;
}
`,
        },
        {
          path: "integrations/project-gantt/date-engine.ts",
          content: `
import type { GanttTask } from "./dependency-graph";

export function calculateSchedule(tasks: GanttTask[]) {
  return tasks.map((task) => {
    const start = new Date(task.start);
    const end = new Date(start);
    end.setDate(start.getDate() + task.durationDays);
    return { ...task, end: end.toISOString().slice(0, 10) };
  });
}
`,
        },
        {
          path: "integrations/project-gantt/canvas-renderer.ts",
          content: `
export function ganttBar(task: { id: string; title: string }, x: number, y: number, width: number) {
  return \`<g data-task="\${task.id}"><rect x="\${x}" y="\${y}" width="\${width}" height="28" rx="6" /><text x="\${x + 8}" y="\${y + 19}">\${task.title}</text></g>\`;
}
`,
        },
        {
          path: "integrations/project-gantt/reschedule.ts",
          content: `
export function rescheduleTask(start: string, deltaDays: number) {
  const date = new Date(start);
  date.setDate(date.getDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}
`,
        },
      ],
    },
    testCases: [
      { input: "task with dependency", expectedOutput: "dependency appears before dependent task" },
      { input: "drag task three days", expectedOutput: "start date advances by three days" },
    ],
  },
  {
    name: "Booking-Calendar",
    category: "booking",
    description: "Availability matrix, ICS file generation, Google Calendar sync boundary, and recurring rule parser.",
    validationScore: 98,
    codeTemplate: {
      dependencies: [],
      env: ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"],
      files: [
        {
          path: "integrations/booking-calendar/availability.ts",
          content: `
export type Slot = { id: string; startsAt: string; capacity: number; booked: number };

export function availableSlots(slots: Slot[]) {
  return slots.filter((slot) => slot.booked < slot.capacity);
}

export function reserveSlot(slot: Slot) {
  if (slot.booked >= slot.capacity) throw new Error("Slot is full");
  return { ...slot, booked: slot.booked + 1 };
}
`,
        },
        {
          path: "integrations/booking-calendar/ics.ts",
          content: `
export function icsEvent(input: { uid: string; title: string; startsAt: string; endsAt: string }) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", \`UID:\${input.uid}\`, \`SUMMARY:\${input.title}\`, \`DTSTART:\${formatIcsDate(input.startsAt)}\`, \`DTEND:\${formatIcsDate(input.endsAt)}\`, "END:VEVENT", "END:VCALENDAR"].join("\\r\\n");
}

function formatIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(".000", "");
}
`,
        },
        {
          path: "integrations/booking-calendar/google-sync.ts",
          content: `
export type CalendarEvent = { id: string; title: string; startsAt: string; endsAt: string };

export async function syncGoogleCalendarEvent(event: CalendarEvent) {
  return { provider: "google-calendar", synced: true, providerEventId: \`gcal_\${event.id}\` };
}
`,
        },
        {
          path: "integrations/booking-calendar/recurrence.ts",
          content: `
export function parseWeeklyRule(rule: string) {
  const intervalMatch = rule.match(/INTERVAL=(\\d+)/);
  const byDayMatch = rule.match(/BYDAY=([^;]+)/);
  return {
    frequency: rule.includes("FREQ=WEEKLY") ? "weekly" : "custom",
    interval: intervalMatch ? Number(intervalMatch[1]) : 1,
    days: byDayMatch ? byDayMatch[1].split(",") : [],
  };
}
`,
        },
      ],
    },
    testCases: [
      { input: "slot capacity 5 booked 4", expectedOutput: "slot is available" },
      { input: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE", expectedOutput: "weekly interval two on Monday and Wednesday" },
    ],
  },
];

export const allIntegrationModules: IntegrationModuleDefinition[] = [
  ...defaultIntegrationModules
    .filter((integration) => !weakCategoryIntegrationModules.some((weakModule) => weakModule.name === integration.name))
    .map((integration) => ({ ...integration, version: integration.version || "1.0.0", immutable: integration.immutable ?? true })),
  ...weakCategoryIntegrationModules,
];
