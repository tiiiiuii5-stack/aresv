import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

async function main() {
  const { integrationModuleService } = await import("../lib/services/integrationModules");
  const results = await integrationModuleService.validateSeededModules();
  const failed = results.filter((result) => !result.passed);

  console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error("Integration module validation failed", error);
  process.exit(1);
});
