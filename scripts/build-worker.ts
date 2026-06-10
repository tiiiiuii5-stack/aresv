import dotenv from "dotenv";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

async function main() {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL is required to start the VentureOS build worker.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to start the VentureOS build worker.");
  }

  const { startBuildWorker } = await import("../lib/workers/buildWorker");
  startBuildWorker();
  console.log(`[BuildWorker] started with Redis queue build-jobs at ${new Date().toISOString()}`);
}

main().catch((error) => {
  console.error("[BuildWorker] failed to start", error);
  process.exit(1);
});
