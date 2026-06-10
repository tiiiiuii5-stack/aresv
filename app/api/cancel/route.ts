import { NextResponse } from "next/server";

import type { AuthSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

export async function POST(request: Request) {
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const body = (await readCompiledJson(request)) as { bookingId?: string };
    const bookingId = body.bookingId?.trim();
    if (!bookingId) throw new Error("bookingId is required");
    const sessionEmail = await resolveSessionEmail(session);

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { timeSlot: true },
    });

    if (!booking) throw new Error("Booking not found");
    if (session.role !== "admin" && booking.memberEmail.toLowerCase() !== sessionEmail.toLowerCase()) {
      throw new Error("FORBIDDEN - NOT BOOKING OWNER");
    }
    if (booking.status !== "confirmed") throw new Error("Can only cancel confirmed");
    if (booking.timeSlot.startTime < new Date()) throw new Error("Cannot cancel past classes");

    await prisma.$transaction([
      prisma.timeSlot.update({
        where: { id: booking.timeSlotId },
        data: { capacityRemaining: { increment: 1 } },
      }),
      prisma.booking.update({
        where: { id: bookingId },
        data: { status: "cancelled", cancelledAt: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel booking";
    return NextResponse.json({ ok: false, error: message }, { status: statusForCancelError(message) });
  }
}

async function resolveSessionEmail(session: AuthSession) {
  if (session.userId.includes("@")) return session.userId;
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } });
  if (!user?.email) throw new Error("SESSION_EMAIL_REQUIRED");
  return user.email;
}

function statusForCancelError(message: string) {
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (message === "SESSION_EMAIL_REQUIRED") return 400;
  return 400;
}
