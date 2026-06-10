// Integration module: Video-Streaming
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing video file" }, { status: 400 });
  if (!file.type.startsWith("video/")) return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  const assetId = crypto.randomUUID();
  return NextResponse.json({ assetId, status: "queued", filename: file.name, bytes: file.size });
}
