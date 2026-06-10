import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const email = process.argv[2] || process.env.FOUNDER_EMAIL || "stackdigitz@gmail.com";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const { grantFounderEntitlement } = await import("../lib/services/founderEntitlement");
  const user = await grantFounderEntitlement(email);
  console.log(`Founder access active for ${user.email} (${user.id}).`);
}
