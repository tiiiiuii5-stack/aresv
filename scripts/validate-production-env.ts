import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exit(1);
});

async function main() {
  const { validateEnv } = await import("@/lib/env");
  validateEnv({ production: true });
  console.log(JSON.stringify({
    ok: true,
    productionEnv: "valid",
    checked: [
      "DATABASE_URL",
      "GEMINI_API_KEY or GOOGLE_API_KEY",
      "ENCRYPTION_KEY or AGENT_MEMORY_ENCRYPTION_KEY",
      "ADMIN_PASSWORD",
      "ADMIN_SESSION_SECRET",
      "SESSION_SECRET or ADMIN_SESSION_SECRET or NEXTAUTH_SECRET",
      "VENTUREOS_CERT_PRIVATE_KEY_PEM or VENTUREOS_CERT_PRIVATE_KEY_BASE64",
      "VENTUREOS_CERT_PUBLIC_KEY_PEM or VENTUREOS_CERT_PUBLIC_KEY_BASE64",
      "VENTUREOS_CERT_SIGNING_KEY_ID",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
    ],
  }));
}
