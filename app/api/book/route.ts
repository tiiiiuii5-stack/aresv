import { NextResponse } from "next/server";

import type { AuthSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export async function POST(request: Request) {
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const body = (await readCompiledJson(request)) as {
      timeSlotId?: string;
      memberName?: string;
      memberEmail?: string;
    };
    const timeSlotId = body.timeSlotId?.trim();
    const sessionEmail = await resolveSessionEmail(session);
    const memberName = body.memberName?.trim();
    const memberEmail = sessionEmail.toLowerCase();
    if (!timeSlotId) throw new Error("timeSlotId is required");
    if (!memberName) throw new Error("memberName is required");

    const result = await prisma.$transaction(async (tx) => {
      const timeSlot = await tx.timeSlot.findUnique({
        where: { id: timeSlotId },
        include: { class: { include: { instructor: true, studio: true } } },
      });

      if (!timeSlot) throw new Error("Time slot not found");
      if (!timeSlot.isPublished) throw new Error("Class is not published");
      if (timeSlot.capacityRemaining <= 0) throw new Error("Class is full");

      const existing = await tx.booking.findFirst({
        where: { timeSlotId, memberEmail, status: "confirmed" },
        select: { id: true },
      });
      if (existing) throw new Error("You already booked this class");

      const capacityUpdate = await tx.timeSlot.updateMany({
        where: { id: timeSlotId, isPublished: true, capacityRemaining: { gt: 0 } },
        data: { capacityRemaining: { decrement: 1 } },
      });
      if (capacityUpdate.count !== 1) throw new Error("Class is full");

      const booking = await tx.booking.create({
        data: {
          timeSlotId,
          memberName,
          memberEmail,
          status: "confirmed",
        },
      });

      const updatedTimeSlot = await tx.timeSlot.findUniqueOrThrow({
        where: { id: timeSlotId },
        include: { class: { include: { instructor: true, studio: true } } },
      });

      return { booking, timeSlot: updatedTimeSlot };
    });

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to book class";
    return NextResponse.json({ ok: false, error: message }, { status: statusForBookingError(message) });
  }
}

async function resolveSessionEmail(session: AuthSession) {
  if (session.userId.includes("@")) return session.userId;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  if (!user?.email) throw new Error("SESSION_EMAIL_REQUIRED");
  return user.email;
}

function statusForBookingError(message: string) {
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "SESSION_EMAIL_REQUIRED") return 400;
  return 400;
}
