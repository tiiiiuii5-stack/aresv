import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

import { planApp } from "@/lib/app-planning-engine";
import { BookingDomainRuntime } from "@/lib/booking-domain-runtime";
import { generateIsolatedAppFiles } from "@/lib/isolated-app-generator";

async function main() {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "ventureos-booking-domain-"));
  try {
    const runtime = new BookingDomainRuntime(path.join(tmp, "booking-store.json"));
    await runtime.reset();

    await test("booking decreases capacity", async () => {
      const slot = await runtime.createTimeSlot({ capacity: 5 });
      await runtime.bookSession(slot.id, "Alice");
      const updated = await runtime.getTimeSlot(slot.id);
      assert.equal(updated?.capacityRemaining, 4);
    });

    await test("cancellation restores capacity", async () => {
      await runtime.reset();
      const slot = await runtime.createTimeSlot({ capacity: 5 });
      const booking = await runtime.bookSession(slot.id, "Bob");
      await runtime.cancelBooking(booking.id);
      const updated = await runtime.getTimeSlot(slot.id);
      assert.equal(updated?.capacityRemaining, 5);
    });

    await test("cannot book full class", async () => {
      await runtime.reset();
      const slot = await runtime.createTimeSlot({ capacity: 1 });
      await runtime.bookSession(slot.id, "Alice");
      await assert.rejects(() => runtime.bookSession(slot.id, "Bob"), /Class is full/);
    });

    await test("role views exist", async () => {
      const appDir = path.join(tmp, "generated-booking-app");
      await writeGeneratedBookingApp(appDir);
      assert.equal(fs.existsSync(path.join(appDir, "app", "owner", "page.tsx")), true);
      assert.equal(fs.existsSync(path.join(appDir, "app", "instructor", "page.tsx")), true);
      assert.equal(fs.existsSync(path.join(appDir, "app", "member", "page.tsx")), true);
    });

    await test("data persists after refresh", async () => {
      await runtime.reset();
      const slot = await runtime.createTimeSlot({ capacity: 5 });
      const booking = await runtime.bookSession(slot.id, "Charlie");
      const restarted = new BookingDomainRuntime(path.join(tmp, "booking-store.json"));
      const persisted = await restarted.getBooking(booking.id);
      assert.ok(persisted);
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function writeGeneratedBookingApp(appDir: string) {
  const plan = planApp(
    "Build booking platform for studios with studio owners, instructors, and members. Booking decreases capacity, cancellation restores capacity, instructors mark attendance.",
    "booking",
  );
  const files = generateIsolatedAppFiles(plan, "booking-validation");
  for (const file of files) {
    const target = path.join(appDir, file.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
}

async function test(name: string, run: () => Promise<void>) {
  await run();
  console.log(`PASS ${name}`);
}

main().catch((error) => {
  console.error("Booking domain validation failed");
  console.error(error);
  process.exitCode = 1;
});
