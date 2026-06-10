import { jwtVerify } from "jose";

export type IntelligencePrincipal = {
  subject: string;
  scopes: string[];
};

export async function verifyIntelligenceBearer(request: Request): Promise<IntelligencePrincipal> {
  const header = request.headers.get("authorization") || "";
  const [scheme, token] = header.split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token) throw new Error("Missing JWT bearer token.");

  const secret = process.env.INTELLIGENCE_API_JWT_SECRET || process.env.ADMIN_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("INTELLIGENCE_API_JWT_SECRET is not configured.");

  const verified = await jwtVerify(token, new TextEncoder().encode(secret), {
    algorithms: ["HS256"],
  });
  const scopes = normalizeScopes(verified.payload.scope || verified.payload.scopes);
  if (!scopes.includes("*") && !scopes.includes("intelligence:analyze")) {
    throw new Error("JWT token is missing intelligence:analyze scope.");
  }

  return {
    subject: verified.payload.sub || "unknown",
    scopes,
  };
}

function normalizeScopes(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/\s+/).filter(Boolean);
  return [];
}
