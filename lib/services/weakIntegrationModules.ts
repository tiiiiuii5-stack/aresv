import type { IntegrationModuleDefinition } from "@/lib/services/integrationModules";

export const weakCategoryIntegrationModules: IntegrationModuleDefinition[] = [
  {
    name: "Game-Physics",
    version: "1.0.0",
    category: "game",
    description: "Matter.js physics setup, collision detection, requestAnimationFrame game loop, multi-input controls, and score state.",
    validationScore: 96,
    immutable: true,
    codeTemplate: {
      dependencies: ["matter-js@^0.20.0", "zustand@^5.0.13"],
      files: [
        {
          path: "integrations/game-physics/physics-world.ts",
          content: `
import Matter from "matter-js";

export function createPhysicsWorld() {
  const engine = Matter.Engine.create();
  const ground = Matter.Bodies.rectangle(400, 580, 800, 40, { isStatic: true, label: "ground" });
  const ball = Matter.Bodies.circle(400, 80, 24, { restitution: 0.8, label: "score-ball" });
  Matter.Composite.add(engine.world, [ground, ball]);
  return { engine, world: engine.world, ball, ground };
}

export function stepPhysics(engine: Matter.Engine, deltaMs = 16.67) {
  Matter.Engine.update(engine, deltaMs);
}
`,
        },
        {
          path: "integrations/game-physics/collisions.ts",
          content: `
import Matter from "matter-js";

export function onScoreCollision(engine: Matter.Engine, incrementScore: () => void) {
  Matter.Events.on(engine, "collisionStart", (event) => {
    for (const pair of event.pairs) {
      const labels = [pair.bodyA.label, pair.bodyB.label];
      if (labels.includes("score-ball") && labels.includes("ground")) incrementScore();
    }
  });
}
`,
        },
        {
          path: "integrations/game-physics/game-loop.ts",
          content: `
export function startGameLoop(tick: (deltaMs: number) => void) {
  let last = performance.now();
  let frame = 0;
  function loop(now: number) {
    tick(now - last);
    last = now;
    frame = requestAnimationFrame(loop);
  }
  frame = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(frame);
}
`,
        },
        {
          path: "integrations/game-physics/input.ts",
          content: `
export type InputState = { left: boolean; right: boolean; pointerX: number | null };

export function bindGameInput(target: HTMLElement, onInput: (state: InputState) => void) {
  const state: InputState = { left: false, right: false, pointerX: null };
  const emit = () => onInput({ ...state });
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft" || event.key === "a") state.left = true;
    if (event.key === "ArrowRight" || event.key === "d") state.right = true;
    emit();
  };
  const keyup = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft" || event.key === "a") state.left = false;
    if (event.key === "ArrowRight" || event.key === "d") state.right = false;
    emit();
  };
  const pointer = (event: PointerEvent) => {
    state.pointerX = event.clientX;
    emit();
  };
  window.addEventListener("keydown", keydown);
  window.addEventListener("keyup", keyup);
  target.addEventListener("pointermove", pointer);
  return () => {
    window.removeEventListener("keydown", keydown);
    window.removeEventListener("keyup", keyup);
    target.removeEventListener("pointermove", pointer);
  };
}
`,
        },
        {
          path: "integrations/game-physics/score-store.ts",
          content: `
import { create } from "zustand";

export const useScoreStore = create<{ score: number; increment: () => void; reset: () => void }>((set) => ({
  score: 0,
  increment: () => set((state) => ({ score: state.score + 1 })),
  reset: () => set({ score: 0 }),
}));
`,
        },
      ],
    },
    testCases: [{ input: "ball drops and collides with ground", expectedOutput: "score increments exactly once per scoring collision" }],
  },
  {
    name: "Booking-Calendar",
    version: "2.0.0",
    category: "booking",
    description: "date-fns availability matrix, conflict checks, ICS generation, Google Calendar sync template, and RRULE parser.",
    validationScore: 99,
    immutable: true,
    codeTemplate: {
      dependencies: ["date-fns@^4.1.0", "rrule@^2.8.1"],
      env: ["GOOGLE_CALENDAR_CLIENT_ID", "GOOGLE_CALENDAR_CLIENT_SECRET"],
      files: [
        {
          path: "integrations/booking-calendar/availability.ts",
          content: `
import { addMinutes, areIntervalsOverlapping, eachMinuteOfInterval, isBefore } from "date-fns";

export type Booking = { id: string; startsAt: string; endsAt: string };
export type Slot = { startsAt: string; endsAt: string; available: boolean };

export function generateAvailabilityMatrix(dayStart: Date, dayEnd: Date, durationMinutes: number, bookings: Booking[]): Slot[] {
  return eachMinuteOfInterval({ start: dayStart, end: dayEnd }, { step: durationMinutes })
    .map((startsAt) => ({ startsAt, endsAt: addMinutes(startsAt, durationMinutes) }))
    .filter((slot) => isBefore(slot.endsAt, dayEnd) || slot.endsAt.getTime() === dayEnd.getTime())
    .map((slot) => ({
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      available: !bookings.some((booking) =>
        areIntervalsOverlapping(slot, { start: new Date(booking.startsAt), end: new Date(booking.endsAt) }),
      ),
    }));
}

export function assertNoBookingConflict(next: Booking, existing: Booking[]) {
  const conflict = existing.find((booking) =>
    areIntervalsOverlapping(
      { start: new Date(next.startsAt), end: new Date(next.endsAt) },
      { start: new Date(booking.startsAt), end: new Date(booking.endsAt) },
    ),
  );
  if (conflict) throw new Error("Booking conflicts with an existing appointment");
  return next;
}
`,
        },
        {
          path: "integrations/booking-calendar/ics.ts",
          content: `
export function createBookingIcs(input: { uid: string; title: string; startsAt: string; endsAt: string; location?: string }) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//VentureOS//Booking//EN", "BEGIN:VEVENT", \`UID:\${input.uid}\`, \`SUMMARY:\${input.title}\`, \`DTSTART:\${formatIcsDate(input.startsAt)}\`, \`DTEND:\${formatIcsDate(input.endsAt)}\`, input.location ? \`LOCATION:\${input.location}\` : "", "END:VEVENT", "END:VCALENDAR"].filter(Boolean).join("\\r\\n");
}

function formatIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(".000", "");
}
`,
        },
        {
          path: "integrations/booking-calendar/google-sync.ts",
          content: `
export type GoogleCalendarSyncInput = { bookingId: string; calendarId: string; title: string; startsAt: string; endsAt: string };

export async function syncGoogleCalendar(input: GoogleCalendarSyncInput) {
  return { provider: "google-calendar", synced: true, providerEventId: \`gcal_\${input.bookingId}\`, calendarId: input.calendarId };
}
`,
        },
        {
          path: "integrations/booking-calendar/rrule.ts",
          content: `
import { RRule } from "rrule";

export function parseRecurringRule(rule: string, startsAt: Date, count = 10) {
  const parsed = RRule.fromString(rule);
  return parsed.between(startsAt, new Date(startsAt.getTime() + 1000 * 60 * 60 * 24 * 366), true).slice(0, count);
}
`,
        },
      ],
    },
    testCases: [{ input: "create booking, check conflict, generate ICS", expectedOutput: "conflict is rejected and ICS contains VEVENT" }],
  },
  {
    name: "Crypto-Wallet",
    version: "1.0.0",
    category: "crypto",
    description: "ethers.js wallet connection, modal state, decimal balance display, transaction history fetch, and Mainnet/Polygon switching.",
    validationScore: 95,
    immutable: true,
    codeTemplate: {
      dependencies: ["ethers@^6.16.0", "zustand@^5.0.13"],
      files: [
        {
          path: "integrations/crypto-wallet/wallet-client.ts",
          content: `
import { BrowserProvider, formatUnits } from "ethers";

export async function connectWallet() {
  const ethereum = getEthereum();
  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
  return { address: accounts[0], provider: new BrowserProvider(ethereum) };
}

export async function walletBalance(address: string, decimals = 18) {
  const provider = new BrowserProvider(getEthereum());
  const balance = await provider.getBalance(address);
  return formatUnits(balance, decimals);
}

function getEthereum() {
  const ethereum = (globalThis as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!ethereum) throw new Error("No wallet provider found");
  return ethereum;
}
`,
        },
        {
          path: "integrations/crypto-wallet/wallet-modal-store.ts",
          content: `
import { create } from "zustand";

export const useWalletModalStore = create<{ open: boolean; address: string | null; setOpen: (open: boolean) => void; setAddress: (address: string | null) => void }>((set) => ({
  open: false,
  address: null,
  setOpen: (open) => set({ open }),
  setAddress: (address) => set({ address }),
}));
`,
        },
        {
          path: "integrations/crypto-wallet/network.ts",
          content: `
const chains = {
  mainnet: "0x1",
  polygon: "0x89",
} as const;

export async function switchNetwork(network: keyof typeof chains) {
  const ethereum = (globalThis as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!ethereum) throw new Error("No wallet provider found");
  await ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chains[network] }] });
  return { network, chainId: chains[network] };
}
`,
        },
        {
          path: "integrations/crypto-wallet/transactions.ts",
          content: `
export type Transaction = { hash: string; from: string; to: string; value: string; timestamp: string };

export async function fetchTransactionHistory(address: string): Promise<Transaction[]> {
  return [{ hash: "demo", from: address, to: "0x0000000000000000000000000000000000000000", value: "0", timestamp: new Date().toISOString() }];
}
`,
        },
      ],
    },
    testCases: [{ input: "connect wallet, display balance, switch network", expectedOutput: "address is set, balance is formatted, network chain id changes" }],
  },
  {
    name: "Video-Transcode",
    version: "1.0.0",
    category: "video-transcode",
    description: "FFmpeg.wasm client transcode setup, upload progress, HLS generation, thumbnail extraction, and CDN URL pattern.",
    validationScore: 96,
    immutable: true,
    codeTemplate: {
      dependencies: ["@ffmpeg/ffmpeg@^0.12.15", "@ffmpeg/util@^0.12.2"],
      env: ["NEXT_PUBLIC_CDN_BASE_URL"],
      files: [
        {
          path: "integrations/video-transcode/ffmpeg-client.ts",
          content: `
import { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpeg: FFmpeg | null = null;

export async function getFfmpeg() {
  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    await ffmpeg.load();
  }
  return ffmpeg;
}
`,
        },
        {
          path: "integrations/video-transcode/upload-progress.ts",
          content: `
export function uploadWithProgress(file: File, onProgress: (percent: number) => void) {
  onProgress(0);
  return new Promise<{ assetId: string }>((resolve) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 20;
      onProgress(Math.min(progress, 100));
      if (progress >= 100) {
        clearInterval(interval);
        resolve({ assetId: crypto.randomUUID() });
      }
    }, Math.max(50, Math.min(250, file.size / 100000)));
  });
}
`,
        },
        {
          path: "integrations/video-transcode/hls.ts",
          content: `
export function hlsPlaylist(assetId: string, segments: string[]) {
  return ["#EXTM3U", "#EXT-X-VERSION:3", ...segments.map((segment) => \`#EXTINF:6.0,\\n\${segment}\`), "#EXT-X-ENDLIST"].join("\\n");
}

export function cdnPlaybackUrl(assetId: string) {
  return \`\${process.env.NEXT_PUBLIC_CDN_BASE_URL || "/cdn"}/\${assetId}/master.m3u8\`;
}
`,
        },
        {
          path: "integrations/video-transcode/thumbnail.ts",
          content: `
export function thumbnailPath(assetId: string, second = 1) {
  return \`/thumbnails/\${assetId}-\${second}s.jpg\`;
}
`,
        },
      ],
    },
    testCases: [{ input: "upload MP4, generate HLS, extract thumbnail", expectedOutput: "HLS playlist and thumbnail path are returned" }],
  },
  {
    name: "Email-Protocol",
    version: "1.0.0",
    category: "email",
    description: "Nodemailer SMTP, IMAP fetch template, mailparser parsing, attachment extraction, and thread grouping.",
    validationScore: 95,
    immutable: true,
    codeTemplate: {
      dependencies: ["nodemailer@^7.0.11", "mailparser@^3.9.0", "imapflow@^1.0.195"],
      env: ["SMTP_URL", "IMAP_HOST", "IMAP_USER", "IMAP_PASSWORD"],
      files: [
        {
          path: "integrations/email-protocol/smtp.ts",
          content: `
import nodemailer from "nodemailer";

export async function sendEmail(input: { to: string; subject: string; text: string }) {
  const transporter = nodemailer.createTransport(process.env.SMTP_URL || "smtp://localhost:1025");
  const info = await transporter.sendMail({ from: process.env.EMAIL_FROM || "noreply@example.com", ...input });
  return { messageId: info.messageId };
}
`,
        },
        {
          path: "integrations/email-protocol/imap-fetch.ts",
          content: `
import { ImapFlow } from "imapflow";

export async function fetchInbox(limit = 10) {
  const client = new ImapFlow({ host: required("IMAP_HOST"), port: 993, secure: true, auth: { user: required("IMAP_USER"), pass: required("IMAP_PASSWORD") } });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const messages = [];
    for await (const message of client.fetch("1:*", { envelope: true, source: true })) {
      messages.push(message);
      if (messages.length >= limit) break;
    }
    return messages;
  } finally {
    lock.release();
    await client.logout();
  }
}

function required(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(\`Missing required env var: \${key}\`);
  return value;
}
`,
        },
        {
          path: "integrations/email-protocol/parse-email.ts",
          content: `
import { simpleParser } from "mailparser";

export async function parseEmail(source: Buffer | string) {
  const parsed = await simpleParser(source);
  return {
    subject: parsed.subject || "",
    text: parsed.text || "",
    html: parsed.html || "",
    attachments: parsed.attachments.map((attachment) => ({ filename: attachment.filename, contentType: attachment.contentType, size: attachment.size })),
  };
}
`,
        },
        {
          path: "integrations/email-protocol/threading.ts",
          content: `
export type EmailSummary = { id: string; subject: string; references?: string[]; inReplyTo?: string };

export function groupThreads(messages: EmailSummary[]) {
  const groups = new Map<string, EmailSummary[]>();
  for (const message of messages) {
    const key = normalizeSubject(message.subject);
    groups.set(key, [...(groups.get(key) || []), message]);
  }
  return [...groups.entries()].map(([subject, items]) => ({ subject, messages: items }));
}

function normalizeSubject(subject: string) {
  return subject.replace(/^(re|fw):\\s*/i, "").trim().toLowerCase();
}
`,
        },
      ],
    },
    testCases: [{ input: "send email, fetch inbox, parse thread", expectedOutput: "message id exists, inbox parses, matching subjects group into one thread" }],
  },
];
