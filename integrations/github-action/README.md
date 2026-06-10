# VentureOS GitHub Action

This composite action submits CI/CD evidence to VentureOS and receives a signed ingestion receipt.

Required VentureOS API key scope: `evidence:write`.

```yaml
name: VentureOS Evidence

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
      - uses: ./integrations/github-action
        if: always()
        with:
          ventureos-url: https://your-ventureos-domain.com
          api-key: ${{ secrets.VENTUREOS_API_KEY }}
          event-type: test.completed
          status: ${{ job.status }}
          controls: SOC2:CC8.1,ISO27001:8.32
```

The receipt proves VentureOS received and signed the canonical evidence event. It does not prove the CI provider output is true unless the event came from a trusted workflow and the artifact digests were independently computed.
