import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { compileTrust, readCompiledJson } from "@/lib/trust/compiler";

const attendanceStatuses = new Set(["present", "absent", "late"]);

export async function POST(request: Request) {
  try {
    const { session } = await compileTrust(request, { mode: "session" });
    const body = (await readCompiledJson(request)) as {
      bookingId?: string;
      status?: string;
    };
    const bookingId = body.bookingId?.trim();
    const status = body.status?.trim().toLowerCase();
    const markedBy = session.userId;
    if (!bookingId) throw new Error("bookingId is required");
    if (!status || !attendanceStatuses.has(status)) throw new Error("Attendance status must be present, absent, or late");
    if (!hasServerBookingRole(session.role, "Instructor")) throw new Error("Only Instructors can mark attendance");

    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { timeSlot: { include: { class: { include: { instructor: true, studio: true } } } } },
      });
      if (!booking) throw new Error("Booking not found");
      if (session.role !== "admin" && booking.timeSlot.class.instructorId !== session.userId) {
        throw new Error("FORBIDDEN - NOT CLASS INSTRUCTOR");
      }
      if (booking.status !== "confirmed") throw new Error("Attendance can only be marked for confirmed bookings");

      const attendance = await tx.attendance.upsert({
        where: { bookingId },
        update: { status, markedBy, markedAt: new Date() },
        create: { bookingId, status, markedBy },
      });

      const updatedBooking = await tx.booking.update({
        where: { id: bookingId },
        data: { status: "attended" },
      });

      return { booking: updatedBooking, attendance };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to mark attendance";
    return NextResponse.json({ ok: false, error: message }, { status: statusForAttendanceError(message) });
  }
}

function hasServerBookingRole(sessionRole: string, requiredRole: "Owner" | "Instructor") {
  const normalizedRole = sessionRole.trim().toLowerCase();
  return normalizedRole === requiredRole.toLowerCase() || normalizedRole === "admin";
}

function statusForAttendanceError(message: string) {
  if (message === "UNAUTHORIZED") return 401;
  if (message.startsWith("Only ") || /FORBIDDEN/.test(message)) return 403;
  return 400;
}
