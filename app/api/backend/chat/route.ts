import { NextRequest, NextResponse } from "next/server";

import { createTrace, errorResponse, trace } from "@/lib/diagnostics";
import { enforceRateLimit, RATE_LIMITS, readJsonBody } from "@/lib/security/backendSecurity";
import { backendChatService } from "@/lib/services/backendChat";
import { compileTrust, stripClientIdentity } from "@/lib/trust/compiler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const traceId = createTrace("backend.chat.POST");
  try {
    const rateLimit = await enforceRateLimit(request, RATE_LIMITS.backendChat);
    const { session } = await compileTrust(request, { mode: "session" });
    const body = stripClientIdentity(await readJsonBody(request, { maxBytes: 250_000 }));
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const model = typeof body.model === "string" ? body.model : undefined;
    const stream = body.stream === true;
    trace("backend.chat.POST", "payload parsed", {
      traceId,
      userId: session.userId,
      promptLength: prompt.length,
      messages: messages.length,
      stream,
    });

    if (stream) {
      const encoder = new TextEncoder();
      const readable = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            await backendChatService.stream({ prompt, messages, model }, (token) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
            });
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
            controller.close();
          } catch (error) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "Backend chat failed." })}\n\n`));
            controller.close();
          }
        },
      });
      return new NextResponse(readable, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store",
          ...Object.fromEntries(rateLimit.headers.entries()),
        },
      });
    }

    const result = await backendChatService.complete({ prompt, messages, model });
    return NextResponse.json({ ok: true, traceId, ...result }, { headers: rateLimit.headers });
  } catch (error) {
    return errorResponse("backend.chat.POST", traceId, error, statusForBackendChat(error));
  }
}

function statusForBackendChat(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "UNAUTHORIZED") return 401;
  if (/FORBIDDEN/.test(message)) return 403;
  if (/required|prompt|messages|json|content-type/i.test(message)) return 400;
  if (/GEMINI_API_KEY|GOOGLE_API_KEY/.test(message)) return 503;
  if (/Too many requests/i.test(message)) return 429;
  return 500;
}
