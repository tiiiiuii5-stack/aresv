import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { compileTrust } from "@/lib/trust/compiler";

export async function GET(request: Request) {
  try {
    await compileTrust(request, { mode: "publicRead" });
    const url = new URL(request.url);
    const instructorId = url.searchParams.get("instructorId") || undefined;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const publishedOnly = url.searchParams.get("publishedOnly") !== "false";

    const schedule = await prisma.timeSlot.findMany({
      where: {
        ...(publishedOnly ? { isPublished: true } : {}),
        ...(from || to
          ? {
              startTime: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
        ...(instructorId ? { class: { instructorId } } : {}),
      },
      include: {
        class: {
          include: {
            instructor: true,
            studio: true,
          },
        },
        bookings: {
          include: { attendance: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { startTime: "asc" },
    });

    return NextResponse.json({ ok: true, schedule });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load schedule";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
