import { GoogleGenAI } from "@google/genai";

export type BackendChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type BackendChatInput = {
  prompt?: string;
  messages?: BackendChatMessage[];
  model?: string;
};

const systemPrompt =
  "You are VentureOS backend intelligence. Answer like a production-minded software operator: concise, evidence-aware, and focused on what should ship, what is risky, and what action is required.";

export class BackendChatService {
  async stream(input: BackendChatInput, onToken: (token: string) => void | Promise<void>) {
    const ai = this.client();
    const model = this.model(input.model);
    const stream = await ai.models.generateContentStream({
      model,
      contents: toGeminiContents(input),
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.4,
      },
    });

    for await (const chunk of stream) {
      const token = chunk.text || "";
      if (token) await onToken(token);
    }
    return { model };
  }

  async complete(input: BackendChatInput) {
    let content = "";
    const { model } = await this.stream(input, (token) => {
      content += token;
    });
    return { model, content };
  }

  private client() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY is required for backend chat.");
    return new GoogleGenAI({ apiKey });
  }

  private model(value?: string) {
    return String(value || process.env.GEMINI_MODEL || process.env.GOOGLE_GENAI_MODEL || "gemini-2.5-flash").slice(0, 80);
  }
}

export const backendChatService = new BackendChatService();

function toGeminiContents(input: BackendChatInput) {
  const sourceMessages = normalizeMessages(input.messages).length
    ? normalizeMessages(input.messages)
    : [{ role: "user" as const, content: String(input.prompt || "") }];

  const filtered = sourceMessages
    .filter((message) => message.content.trim())
    .slice(-30)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content.slice(0, 20_000) }],
    }));

  if (!filtered.length) throw new Error("prompt or messages are required.");
  return filtered;
}

function normalizeMessages(value: unknown): BackendChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      role: item.role === "assistant" || item.role === "system" ? item.role : "user",
      content: String(item.content || ""),
    }));
}
