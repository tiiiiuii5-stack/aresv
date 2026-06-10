import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

async function main() {
  const { integrationModuleService } = await import("../lib/services/integrationModules");
  const result = await integrationModuleService.seedDefaults();
  console.log(`Integration modules seeded: ${result.seeded}; skipped: ${result.skipped}`);
}

main().catch((error) => {
  console.error("Failed to seed integration modules", error);
  process.exit(1);
});
