import dotenv from "dotenv";

import { publishExternalAnchor } from "@/lib/transparency/externalAnchorPublisher";
import { buildPublicAnchorManifest } from "@/lib/transparency/transparencyLog";

dotenv.config({ path: ".env.local", override: true });
dotenv.config();

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});

async function main() {
  const certificateId = process.env.TRANSPARENCY_ANCHOR_CERTIFICATE_ID || process.argv.find((arg) => arg.startsWith("--certificate="))?.split("=")[1] || "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3002";
  const manifest = await buildPublicAnchorManifest({ certificateId, baseUrl });
  const publication = await publishExternalAnchor({ manifest });
  console.log(JSON.stringify({
    ok: true,
    certificateId: certificateId || null,
    anchorHash: manifest.anchorHash,
    rootHash: manifest.rootHash,
    publication,
  }, null, 2));
}
