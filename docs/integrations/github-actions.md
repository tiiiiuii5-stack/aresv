# VentureOS Intelligence GitHub Actions

Use `/api/scan-repo` as a pre-deployment gate in CI/CD. The endpoint returns aggregated scan results and exits unsafe deployments when blocking security or reliability issues are found.

Required repository secrets:

- `VENTUREOS_INTELLIGENCE_API_URL`: production URL for this VentureOS instance
- `VENTUREOS_INTELLIGENCE_API_KEY`: API key with `intelligence:scan` or `*` scope

Optional repository variables:

- `VENTUREOS_SCAN_PROJECT_ID`: VentureOS project ID used to attach scan history and trend comparison
- `VENTUREOS_SCAN_MODE`: `quick` by default, or `deep` for larger production scans
- `VENTUREOS_SCAN_BLOCK_THRESHOLD`: readiness score required to pass, defaults to `75`

Merge enforcement:

- The CLI exits with code `1` when the assurance gate returns `FAIL`.
- GitHub App scans publish the commit status context `VentureOS Readiness`.
- To block merges, enable branch protection and mark `VentureOS Readiness` as a required status check.
- Warnings do not block by default unless repository metadata enables warning blocking.

Example workflow:

```yaml
name: VentureOS Intelligence Scan

on:
  pull_request:
  push:
    branches: [main]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Scan repository
        env:
          VENTUREOS_INTELLIGENCE_API_URL: ${{ secrets.VENTUREOS_INTELLIGENCE_API_URL }}
          VENTUREOS_INTELLIGENCE_API_KEY: ${{ secrets.VENTUREOS_INTELLIGENCE_API_KEY }}
          VENTUREOS_SCAN_PROJECT_ID: ${{ vars.VENTUREOS_SCAN_PROJECT_ID }}
          VENTUREOS_SCAN_MODE: quick
          VENTUREOS_SCAN_BLOCK_THRESHOLD: 75
          VENTUREOS_SCAN_OUTPUT: ventureos-scan-result.json
        run: node scripts/ventureos-scan-repo.mjs
      - name: Upload VentureOS scan result
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ventureos-scan-result
          path: ventureos-scan-result.json
```

Expected failure behavior:

- HTTP `200`: deployment gate passed
- HTTP `422`: scan completed but deployment should be blocked
- HTTP `401` or `403`: API key is missing, invalid, or lacks scope
- HTTP `402`: plan quota reached
- HTTP `429`: rate limit reached

The scanner does not send binary files, dependency folders, build artifacts, or generated app output.

The scan response includes:

- `ci.gate.status`: `PASS`, `WARNING`, or `FAIL`
- `ci.gate.reasons`: exact blocking reasons with severity mapping and evidence
- `trustScoreExplanation`: score inputs, threshold, severity totals, assurance hashes, and history summary
- `changeImpact`: changed files, linked findings, gate effect, and why each changed file matters
- `scanDiff`: changed, added, removed, and unchanged file counts when a baseline manifest is supplied
- `regressionReport`: stored scan-to-scan history when `VENTUREOS_SCAN_PROJECT_ID` is configured
