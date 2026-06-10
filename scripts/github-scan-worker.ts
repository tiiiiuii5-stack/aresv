import { startGitHubScanWorker } from "@/lib/workers/githubScanWorker";

async function main() {
  startGitHubScanWorker();
  console.log(`[GitHubScanWorker] started with Redis queue github-scan-jobs at ${new Date().toISOString()}`);
}

main().catch((error) => {
  console.error("[GitHubScanWorker] failed to start", error);
  process.exit(1);
});
