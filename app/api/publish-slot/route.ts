import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export async function POST(request: Request) {
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const body = (await readCompiledJson(request)) as { timeSlotId?: string };
    const timeSlotId = body.timeSlotId?.trim();
    if (!timeSlotId) throw new Error("timeSlotId is required");
    if (!hasServerBookingRole(session.role, "Owner")) throw new Error("Only Owners can publish time slots");

    const timeSlot = await prisma.timeSlot.findUnique({
      where: { id: timeSlotId },
      include: { class: { include: { studio: true } } },
    });
    if (!timeSlot) throw new Error("Time slot not found");
    if (session.role !== "admin" && timeSlot.class.studio.ownerId !== session.userId) {
      throw new Error("FORBIDDEN - NOT STUDIO OWNER");
    }
    if (timeSlot.totalCapacity <= 0 || timeSlot.capacityRemaining < 0) throw new Error("Cannot publish invalid capacity");

    const published = await prisma.timeSlot.update({
      where: { id: timeSlotId },
      data: { isPublished: true },
      include: { class: { include: { instructor: true, studio: true } } },
    });

    return NextResponse.json({ ok: true, timeSlot: published });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to publish time slot";
    return NextResponse.json({ ok: false, error: message }, { status: statusForPublishError(message) });
  }
}

function hasServerBookingRole(sessionRole: string, requiredRole: "Owner" | "Instructor") {
  const normalizedRole = sessionRole.trim().toLowerCase();
  return normalizedRole === requiredRole.toLowerCase() || normalizedRole === "admin";
}

function statusForPublishError(message: string) {
  if (message === "UNAUTHORIZED") return 401;
  if (message.startsWith("Only ") || /FORBIDDEN/.test(message)) return 403;
  return 400;
}
