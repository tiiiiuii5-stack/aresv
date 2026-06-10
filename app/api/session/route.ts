import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { compileTrust } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await compileTrust(request, { mode: "publicRead", reason: "client session status" });
  const session = await getSession().catch(() => null);
  return NextResponse.json({
    ok: true,
    authenticated: Boolean(session?.userId),
  });
}
