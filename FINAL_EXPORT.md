# VentureOS Final Export

This repository is the deployable VentureOS app: a Next.js AI SaaS builder with auth, billing, local/cloud AI connections, generated-project storage, live preview routes, owner/admin analytics, Prisma/PostgreSQL data, Redis-backed job infrastructure, Docker support, and Vercel-ready deployment.

## Codex-Style Loop

VentureOS uses one product-grade loop for every generated app:

```txt
User request
-> Intent + spec extraction
-> System architecture
-> UX/UI system design
-> Database + data flow
-> Code generation
-> Simulated execution
-> Auto debug + repair loop
-> Performance + UX optimization
-> Critic review quality gate
-> Repeat simulation, repair, optimization, and critique until stable
-> Final export
```

This loop is enforced in the workspace prompt, backend generation contract, validation/repair flow, and generated app ship reports.

## Required Runtime Guarantees

These are implemented as backend/runtime features, not prompt-only promises:

- Sandbox execution: local previews spawn a real project runtime from the generated app folder; `PREVIEW_RUNTIME=docker` runs the preview through the Docker sandbox policy.
- File system per project: every app is written to its own `generated-apps/<app-name>` directory with path traversal protection.
- Persistent memory: every project stores `.agent/state.json`, `.agent/logs/*`, `.agent/isolation.json`, `.agent/runtime-contract.json`, and global learning under `generated-apps/.system`.
- Live preview system: the preview API starts the generated app runtime, streams logs, probes the HTTP URL, restarts crashed previews, and records preview locks.
- Automatic backend retry loop: generation now runs backend verification before returning ready; install and build gates each retry up to 5 times, apply deterministic repairs, then safe-boot only if recovery fails.
- No fake hosted preview by default: on Vercel, hosted code preview is disabled unless `ALLOW_HOSTED_CODE_PREVIEW=true`; users should run a real local/Docker worker or use Deploy Live.

## Project Structure

```txt
.
├─ app/
│  ├─ page.tsx                         # Main developer workspace
│  ├─ pricing/                         # Public pricing page
│  ├─ account/                         # Account and billing UI
│  ├─ admin/                           # Owner analytics and admin console
│  ├─ preview/[appName]/               # Hosted generated-app code preview
│  ├─ api/
│  │  ├─ agent/                        # Generate, verify, preview, deploy, projects
│  │  ├─ ai-connections/               # Local/cloud AI provider management
│  │  ├─ auth/                         # Signup, login, logout, demo session
│  │  ├─ billing/                      # Stripe checkout, portal, webhook
│  │  ├─ admin/                        # Owner analytics
│  │  └─ health/                       # Production health check
│  └─ components/developer-environment # VS Code-style workspace UI
├─ lib/
│  ├─ agent-engine.ts                  # Generation, validation, preview, deploy engine
│  ├─ auth/                            # Password/session/role helpers
│  ├─ billing/                         # Stripe plan and usage enforcement
│  ├─ db/                              # Prisma client
│  ├─ ai-connections/                  # Provider storage and testing
│  ├─ queue/                           # Job queue primitives
│  ├─ runtime-paths.ts                 # Writable runtime path resolution
│  └─ sandbox-runtime.ts               # Preview isolation policy
├─ prisma/
│  ├─ schema.prisma                    # Users, projects, jobs, billing, usage, AI keys
│  └─ migrations/                      # Production database migrations
├─ docker/
│  ├─ api.Dockerfile
│  └─ worker.Dockerfile
├─ workers/                            # Worker process docs and runtime support
├─ generated-apps/                     # Local generated apps, gitignored
├─ .github/workflows/
│  ├─ ci.yml                           # Type-check, lint, build
│  └─ vercel-production.yml            # Vercel production deploy workflow
├─ .env.example                        # Safe environment template
├─ docker-compose.yml                  # Local Postgres, Redis, API, worker stack
├─ prisma.config.ts                    # Prisma config with .env.local support
└─ server.mjs                          # Next + WebSocket custom server
```

## Setup

```bash
npm ci
cp .env.example .env.local
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`.

Optional local AI:

```bash
ollama serve
ollama pull llama3.2
```

## Run Commands

```bash
npm run dev          # Start VentureOS locally through server.mjs
npm run type-check   # TypeScript validation
npm run lint         # ESLint validation
npm run build        # Production Next.js build
npm run start        # Start production server
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Create/apply local migrations
npm run db:deploy    # Apply migrations in production
npm run db:studio    # Open Prisma Studio
```

## Environment Variables

Required for local development:

```txt
DATABASE_URL=postgresql://app_builder:app_builder@localhost:5432/app_builder
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-32-byte-secret
SESSION_COOKIE_NAME=app_builder_session
OWNER_EMAIL=owner@example.com
OWNER_PASSWORD=
NEXT_PUBLIC_APP_URL=http://localhost:3000
GENERATED_APPS_ROOT=generated-apps
AI_CREDENTIAL_SECRET=replace-with-32-byte-random-secret
```

AI configuration:

```txt
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
AI_MODEL_FAST=
AI_MODEL_BALANCED=
AI_MODEL_CODE=
AI_MODEL_DEEP=
AI_MODEL_REPAIR=
```

Billing configuration:

```txt
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_STARTER_PRICE_ID=
STRIPE_PRO_PRICE_ID=
```

Optional runtime tuning:

```txt
ENABLE_IN_PROCESS_WORKERS=true
WORKER_CONCURRENCY=2
PREVIEW_RUNTIME=local
TENANT_MAX_CONCURRENT_JOBS=2
TENANT_MAX_PREVIEWS=2
OTEL_ENABLED=false
```

Never commit `.env.local` or real Stripe/AI/database secrets.

## Database

Local:

```bash
docker compose up -d postgres redis
npm run db:generate
npm run db:migrate
```

Production:

```bash
npm run db:generate
npm run db:deploy
```

The Prisma schema stores users, roles, subscriptions, usage events, generated project ownership, jobs, builds, billing events, and AI provider connections.

## Preview Instructions

Local VentureOS preview:

```bash
npm run dev
```

Then open `http://localhost:3000`, enter an app idea, click `Generate`, and use:

- `Preview` to open the generated app preview.
- `Validate build` to run quality gates.
- `Deploy live` to create a live deployment for eligible plans.
- `Open in VS Code` to open the generated project folder.

Generated apps are written to `generated-apps/<app-name>`. This folder is intentionally gitignored because it is runtime output.

## Vercel Deployment

1. Create or link a Vercel project.

```bash
npx vercel link
```

2. Add production environment variables in the Vercel dashboard or with the CLI.

```bash
npx vercel env add DATABASE_URL production
npx vercel env add REDIS_URL production
npx vercel env add JWT_SECRET production
npx vercel env add AI_CREDENTIAL_SECRET production
npx vercel env add STRIPE_SECRET_KEY production
npx vercel env add STRIPE_WEBHOOK_SECRET production
```

3. Pull env vars locally when needed.

```bash
npx vercel env pull .env.local --yes
```

4. Validate and deploy.

```bash
npm run type-check
npm run lint
npm run build
npx vercel --prod
```

Production health check:

```txt
https://<your-domain>/api/health
```

## GitHub-Ready Format

Commit these categories:

```txt
app/
lib/
prisma/
docker/
workers/
.github/workflows/
.env.example
.gitignore
.vercelignore
docker-compose.yml
eslint.config.mjs
next.config.mjs
package.json
package-lock.json
postcss.config.js
prisma.config.ts
server.mjs
tailwind.config.ts
tsconfig.json
README.md
FINAL_EXPORT.md
```

Do not commit:

```txt
.env.local
.vercel/
.next/
node_modules/
generated-apps/
*.log
verification-*.png
```

GitHub secrets needed for automated Vercel production deploy:

```txt
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Optional production secrets to store in Vercel, not GitHub:

```txt
DATABASE_URL
REDIS_URL
JWT_SECRET
AI_CREDENTIAL_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_STARTER_PRICE_ID
STRIPE_PRO_PRICE_ID
```

## Release Checklist

```bash
npm ci
npm run db:generate
npm run type-check
npm run lint
npm run build
```

Then verify:

- `/api/health` returns `ok: true`.
- Signup/login/demo auth works.
- Owner account can open `/admin`.
- AI connection page can test Ollama or a cloud provider.
- Generate creates a folder under `generated-apps/`.
- Preview opens for the generated app.
- Billing checkout returns Stripe portal/checkout URLs when Stripe env vars are set.
- Vercel production deploy is green.
