# Neural Forge OS - Full App Specs

## Level 10.5 Objective

Neural Forge OS is being upgraded into a Level 10.5 autonomous software engineering operating system: a Cursor + Devin + Replit + Bolt + enterprise DevOps style runtime for generating, validating, repairing, deploying, scaling, and evolving production-grade applications with minimal human intervention.

Level 10.5 means the platform behaves like a distributed AI software company. It plans the business, validates feasibility, creates requirements, builds architecture intelligence maps, generates dependency-aware execution graphs, coordinates specialist agents, runs quality gates, repairs failures, launches isolated previews, scores output, learns from results, and prepares deployment.

## 1. Product Definition

Neural Forge OS is an autonomous AI software engineering operating system. A user enters a startup or product idea in plain English, and the platform plans, generates, validates, repairs, previews, scores, and prepares a production-ready full-stack application.

The platform is not a template generator. It is a queue-driven, multi-agent, self-improving software factory with isolated previews, project memory, build verification, AI runtime routing, and production infrastructure.

## 2. Primary User Flow

```text
User enters startup idea
  -> Selects generation mode
  -> AI orchestrator plans product and architecture
  -> Specialized agents generate frontend, backend, data, auth, billing, and deployment files
  -> Files are written into an isolated project workspace
  -> Dependencies install
  -> Build runs
  -> Auto-repair attempts deterministic fixes
  -> Safe fallback is applied if required
  -> Preview starts in isolated runtime
  -> Evolution engine scores quality
  -> Memory layer stores lessons for future generations
```

## 2.1 Level 10.5 Orchestration Flow

```text
User Intent Analysis
  -> Business & Market Analysis
  -> Competitive Product Intelligence
  -> Product Requirement Synthesis
  -> Architecture Planning
  -> Dependency Graph Mapping
  -> Database & Data Flow Planning
  -> Frontend Route Planning
  -> Backend Service Planning
  -> API Contract Planning
  -> State Management Planning
  -> Security Architecture Planning
  -> Billing Planning
  -> Infrastructure Planning
  -> Testing Strategy Planning
  -> Security Hardening
  -> Execution Plan Generation
  -> Multi-Agent Parallel Generation
  -> Cross-Agent Review
  -> Validation Contract Execution
  -> Repair & Regeneration Cycles
  -> Sandbox Preview Deployment
  -> Performance Optimization
  -> Deployment Packaging
  -> Evolution Scoring
  -> Memory Learning
  -> Autonomous Improvement Suggestions
```

## 2.2 Architecture Intelligence Maps

Every generation plan includes these pre-code maps:

- Service graph
- Dependency graph
- Event-flow map
- Database relation map
- API contract map
- Route map
- State management map
- Infrastructure topology map

These maps are persisted with the orchestration plan and used for partial regeneration, validation, repair, and deployment packaging.

## 3. Core Product Goals

- Generate real full-stack apps, not mockups.
- Produce apps that are runnable, build-verified, and previewable.
- Support startup, enterprise, SaaS, AI-native, marketplace, fintech, collaboration, mobile-first, and automation modes.
- Keep every generated app isolated by filesystem, runtime namespace, dependency graph, environment, preview process, and deployment namespace.
- Continuously improve generated output using stored memory, failed builds, quality scores, and successful architecture patterns.
- Give users a cinematic but operational command-center UI.

## 4. Supported Generation Modes

| Mode | Purpose |
| --- | --- |
| Startup | Fast investor-ready SaaS prototypes with monetization hooks |
| Enterprise | RBAC, auditability, operational workflows, controlled rollout |
| Hyper-Scale SaaS | Multi-tenant architecture, usage metering, scaling-first design |
| AI-Native | AI workflows, model routing, context memory, streamed responses |
| Marketplace | Listings, buyer/seller flows, transactions, trust systems |
| Fintech | Secure flows, ledger-style records, audit history, risk controls |
| Realtime Collaboration | Presence, websockets, activity feeds, conflict-safe state |
| Mobile First | Touch-first UX, compact payloads, adaptive layouts |
| Automation Platform | Triggers, actions, queues, retries, workflow telemetry |

## 5. Platform Architecture

```text
Next.js Command Center
  -> API Gateway / App Router API Routes
  -> AI Orchestrator
  -> BullMQ Queue + Redis
  -> Worker Cluster
  -> Project Service + PostgreSQL
  -> AI Runtime + Context Memory
  -> Sandbox Preview Runtime
  -> Evolution Engine
  -> Deployment Layer
```

## 5.1 Performance + Scale Runtime

The platform now treats infrastructure as a first-class product surface:

- Redis-backed BullMQ queues for generation, verification, repair, deployment, preview, testing, optimization, and evolution scoring.
- Worker pool policies with per-queue concurrency, CPU/memory budgets, priorities, timeouts, and autoscaling rules.
- Optional in-process workers for local development via `ENABLE_IN_PROCESS_WORKERS=true`; production workers run as separate Docker nodes.
- Queue metrics exposed through `/api/infra/metrics`.
- Structured JSON observability with correlation IDs and OpenTelemetry-ready configuration.
- Realtime websocket streaming with heartbeat cleanup, stale socket termination, and batched event delivery.
- Docker preview command generation through `PREVIEW_RUNTIME=docker`.

## 5.2 Level 11 AI Cloud Operating System

Neural Forge OS now includes cloud-control-plane primitives:

- Cluster node discovery with CPU, memory, active job, queue-depth, latency, and health signals.
- Kubernetes-style scheduler decisions for FIFO, priority, resource-aware, model-aware, tenant-isolated, and latency-optimized scheduling.
- Tenant isolation manifests covering namespace, Redis key prefix, database schema, queue partition, preview namespace, telemetry stream, and worker limits.
- Versioned replayable event backbone for job, worker, node, deployment, and preview lifecycle events.
- Autoscaling recommendations based on queue depth, CPU saturation, memory pressure, and failure signals.
- Failure resilience policy for checkpointing, duplicate execution protection, dead-letter queues, rollback strategies, and safe-mode fallback.
- Cluster-aware model routing using fast, balanced, deep, code, and repair tiers.

Control-plane endpoints:

- `GET /api/infra/metrics` returns runtime, queue, worker, cluster, tenant, and observability state.
- `GET /api/infra/cluster?tenantId=...` returns a tenant-scoped cluster snapshot.
- `POST /api/infra/cluster` returns a scheduler decision for a workload.

## 6. Runtime Services

### Next.js UI

Location:

- `app/page.tsx`
- `app/components/BuilderCommandCenter.tsx`
- `app/components/NeuralForgeScene.tsx`

Responsibilities:

- Prompt input
- Mode selection
- Project list
- Live logs
- Preview iframe
- Code inspection
- Build timeline
- Agent status
- Factory intelligence
- Evolution quality scores

### API Gateway

Important routes:

- `POST /api/agent/generate`
- `POST /api/agent/verify`
- `POST /api/agent/preview`
- `GET /api/agent/projects`
- `GET /api/agent/jobs`
- `POST /api/agent/jobs`
- `GET /api/evolution`
- `GET /api/health`

Responsibilities:

- Validate requests
- Stream NDJSON generation events
- Start build verification
- Start previews
- Return projects/files
- Expose evolution memory
- Expose health status

### AI Orchestrator

Location:

- `lib/agent-engine.ts`
- `lib/autonomous-factory.ts`

Responsibilities:

- Build generation plan
- Select generation mode profile
- Construct multi-agent pipeline
- Build dependency-aware execution graph
- Create resumable checkpoints and execution snapshots
- Generate service, event-flow, route, state, API, database, and infrastructure maps
- Run cross-agent consensus review contracts
- Assign work to distributed worker pools
- Create isolation manifest
- Call Ollama/model backend
- Validate generated payload
- Sanitize package dependencies
- Write project files
- Persist state and metadata

### AI Runtime

Location:

- `lib/ai-runtime.ts`

Responsibilities:

- Route tasks to model tiers
- Store context memory
- Retrieve relevant prior context
- Support lightweight vector-style similarity search
- Improve generation prompts using previous successes and failures

Model tiers:

- `fast`
- `balanced`
- `deep`
- `code`
- `repair`

### Queue System

Location:

- `lib/queue/bullmq.ts`
- `lib/job-queue-enhanced.ts`
- `workers/bullmq-worker.mjs`

Responsibilities:

- Queue expensive work
- Retry failed jobs
- Run workers horizontally
- Keep API stateless
- Coordinate build, fix, preview, and generation jobs

Production queue:

- Redis
- BullMQ
- Worker containers
- Dead-letter retention through BullMQ failed-job history
- Delayed jobs, priorities, retries, and distributed queue persistence

### Worker Cluster

Location:

- `workers/bullmq-worker.mjs`
- `docker/worker.Dockerfile`

Responsibilities:

- Pick BullMQ jobs
- Run dependency installs
- Run production builds
- Dispatch generation to API control plane
- Log progress
- Emit worker telemetry
- Support graceful shutdown
- Enforce concurrency from worker pool policy

Worker pools:

- Planning workers for business, requirements, and architecture
- Generation workers for frontend, backend, API, and database output
- Validation workers for build, browser, accessibility, and repair checks
- Release workers for sandbox runtime, deployment packaging, and evolution memory
- Support horizontal scale

### Database

Location:

- `prisma/schema.prisma`

Primary models:

- `User`
- `Project`
- `ProjectFile`
- `Job`
- `JobLog`
- `Build`
- `UsageEvent`
- `Subscription`

Database responsibilities:

- User accounts
- Project metadata
- File metadata
- Job state
- Build history
- Usage events
- Billing/subscription state

### Sandbox Runtime

Location:

- `lib/sandbox-runtime.ts`

Responsibilities:

- Enforce project root boundaries
- Create sandbox runtime policy
- Set isolated runtime environment variables
- Define writable/read-only roots
- Block unsafe path traversal
- Persist preview policy under project runtime metadata

Preview rules:

- One generated app per preview runtime
- Unique port
- Unique isolation manifest
- Unique runtime namespace
- Stale preview locks are cleaned
- Sandbox policy is written before preview starts

### Evolution Engine

Location:

- `lib/evolution-engine.ts`
- `app/api/evolution/route.ts`

Responsibilities:

- Score generated apps
- Store global learning memory
- Simulate organization review
- Create improvement backlog
- Track learned patterns
- Decide whether regeneration pressure is high

Quality scores:

- UI
- Performance
- Scalability
- Monetization
- Architecture
- Security
- Maintainability
- Accessibility
- Deployability

Organization simulation:

- CEO AI
- CTO AI
- Design Director AI
- Security AI
- Performance AI
- QA Automation AI
- Deployment AI

## 7. Multi-Agent System

The autonomous factory defines persistent specialist agents:

- CEO Agent
- Product Manager Agent
- Product Strategist Agent
- System Architect Agent
- UI/UX Design Director Agent
- Frontend Engineering Agent
- Backend Engineering Agent
- API Architect Agent
- Database Architect Agent
- Motion Designer Agent
- Security Auditor Agent
- QA Automation Agent
- DevOps Infrastructure Agent
- Performance Optimization Agent
- AI Integration Agent
- Realtime Systems Agent
- Deployment Agent
- Monetization Agent
- Growth Engineering Agent
- Repair Agent
- Refactor Agent
- Evolution Agent

Each agent has:

- `id`
- `name`
- `mission`
- `verificationFocus`
- `collaborationStyle`

The pipeline uses these agents to reason about product intent, business viability, competitive differentiation, architecture, UI, backend, API contracts, database, validation, repair, deployment, and optimization. Every pipeline step has a checkpoint and dependency list so interrupted generations can be resumed and weak architecture can be challenged before code generation.

## 8. Generation Pipeline

```text
Intent Analysis
Business Understanding
Competitive Product Reasoning
Technical Feasibility Analysis
Product Requirements Generation
Architecture Planning
Dependency Graph Construction
Database System Design
Frontend System Planning
Backend Service Planning
Authentication Planning
Billing Planning
Infrastructure Planning
Testing Strategy
Security Hardening
Generation Execution
Verification
Repair Loops
Preview Launch
Performance Optimization
Deployment Packaging
Evolution Scoring
Memory Learning
```

Generated project metadata includes:

- `name`
- `summary`
- `mode`
- `orchestration`
- `isolation`
- `qualityGates`
- `prompt`
- `model`
- `modelRoute`
- `createdAt`
- `commands`
- `files`

## 9. Generated App Requirements

Generated apps should include, where relevant:

- Authentication
- Authorization
- Dashboard
- Admin panel
- CRUD APIs
- Responsive UI
- API validation
- Database schema
- Billing-ready surfaces
- Analytics-ready surfaces
- Onboarding
- Notifications
- Search
- File upload surfaces
- Realtime/websocket support
- AI integration layer
- SEO metadata
- Accessibility baseline
- Docker/Vercel deployment artifacts
- Monitoring and logging hooks

## 10. Validation And Self-Healing

Validation steps:

- Install dependencies
- Type checking
- Linting
- Build app
- Unit tests
- Integration tests
- Playwright browser tests
- Accessibility scans
- Performance audits
- Security scans
- SEO validation
- Hydration validation
- API contract validation
- Capture logs
- Classify errors
- Apply deterministic patches
- Retry build
- Safe fallback if repair fails
- Record build state
- Record evolution snapshot

Current deterministic repair examples:

- Sanitize package versions
- Remove invalid Node built-in dependencies from generated `package.json`
- Add `"use client"` when React hooks or browser handlers require it
- Safe boot into a minimal working Next.js app after repeated failures

Validation contract location:

- `lib/validation-contract.ts`

Validation gates are stored as structured data with command, required status, repair strategy, and success signal.

## 11. Project Isolation

Each generated app receives an isolation manifest:

- `sessionId`
- `runId`
- `runtimeNamespace`
- `memoryNamespace`
- `filesystemNamespace`
- `dependencyNamespace`
- `databaseSchema`
- `envNamespace`
- `previewNamespace`
- `deploymentNamespace`

Isolation files:

- `.ai-builder.json`
- `.agent/state.json`
- `.agent/isolation.json`
- `.agent/preview.lock.json`
- `.agent/runtime/<session>/policy.json`

## 12. Infrastructure

### Docker Compose

Location:

- `docker-compose.yml`

Services:

- `postgres`
- `redis`
- `api`
- `worker`

Health checks:

- Postgres uses `pg_isready`
- Redis uses `redis-cli ping`
- API uses `/api/health`
- Worker waits for API, Redis, and Postgres

### Dockerfiles

Locations:

- `docker/api.Dockerfile`
- `docker/worker.Dockerfile`

API container:

- Installs dependencies
- Builds Next.js
- Runs `npm run start`

Worker container:

- Installs dependencies
- Starts `workers/bullmq-worker.mjs`

### Required Environment Variables

Core:

- `DATABASE_URL`
- `REDIS_URL`
- `GENERATED_APPS_ROOT`
- `PORT`
- `NODE_ENV`

AI:

- `OLLAMA_URL`
- `OLLAMA_MODEL`
- `AI_MODEL_FAST`
- `AI_MODEL_BALANCED`
- `AI_MODEL_DEEP`
- `AI_MODEL_CODE`
- `AI_MODEL_REPAIR`

Worker:

- `API_INTERNAL_URL`
- `WORKER_CONCURRENCY`
- `WORKER_ID`

## 13. UI Requirements

The command center must provide:

- Product prompt input
- Generation mode selector
- Model selector
- Generate button
- Background job button
- Draft-only button
- Fix/build button
- Project history
- Build timeline
- Logs tab
- Code tab
- Preview tab
- Tutorial panel
- Agent queue panel
- Factory intelligence panel
- Evolution engine panel

Visual direction:

- Cinematic engineering cockpit
- Dark operational interface
- WebGL ambient scene
- Tight dashboards
- High-contrast status surfaces
- Motion used for state transitions, not decoration overload

## 14. API Specs

### `POST /api/agent/generate`

Request:

```json
{
  "prompt": "Build a B2B CRM for agencies",
  "model": "qwen2.5-coder:7b",
  "mode": "startup",
  "stream": true
}
```

Response:

- NDJSON stream when `stream !== false`
- `{ "jobId": "...", "status": "queued" }` when `stream === false`

### `POST /api/agent/verify`

Request:

```json
{
  "appName": "agency-crm"
}
```

Response:

- NDJSON stream with install/build/repair events and final result

### `POST /api/agent/preview`

Request:

```json
{
  "appName": "agency-crm"
}
```

Response:

```json
{
  "appName": "agency-crm",
  "url": "http://localhost:4102",
  "port": 4102,
  "status": "starting",
  "isolation": {}
}
```

### `GET /api/evolution`

Response:

```json
{
  "memory": {
    "version": 1,
    "apps": {},
    "successfulPatterns": [],
    "failurePatterns": []
  }
}
```

### `GET /api/evolution?appName=<name>`

Response:

```json
{
  "snapshot": {
    "overallScore": 84,
    "scores": []
  }
}
```

### `GET /api/health`

Response:

```json
{
  "ok": true,
  "service": "ai-software-factory",
  "checks": {
    "api": "ready",
    "redis": "configured",
    "database": "configured"
  }
}
```

## 15. Data Persistence

Filesystem:

- Generated app files
- Build logs
- Agent state
- Isolation metadata
- Preview locks
- Evolution memory
- Semantic memory

Database:

- Users
- Projects
- Jobs
- Job logs
- Builds
- Usage events
- Subscriptions

Redis:

- BullMQ jobs
- Queue coordination
- Worker state
- Future preview session tracking
- Future AI response cache

## 16. Security Requirements

Current and required controls:

- Safe app name validation
- Safe relative path validation
- Sandbox path enforcement
- Isolated env namespaces
- Preview lock tracking
- No direct path escape from generated app root
- Auth-required SaaS project routes
- Password hashing
- Session handling

Future required controls:

- Per-preview container sandbox
- Resource limits
- Network egress policy
- Secrets isolation
- Rate limiting
- API abuse protection
- Security scan before deploy

## 17. Performance Requirements

Platform:

- Next.js App Router
- Server-first shell
- Streaming generation events
- WebSocket updates
- Lazy Redis connections
- Worker offload for expensive jobs
- Preview port isolation
- GPU WebGL scene

Generated apps:

- Optimized Next.js build
- Responsive layouts
- SEO metadata
- Minimal dependencies
- Route handlers instead of heavyweight custom servers
- Efficient API response shapes

## 18. Observability

Current:

- Build logs under `.agent/logs`
- Preview logs in memory
- Job logs through BullMQ worker
- `/api/health`
- Evolution score snapshots
- Build history in project state

Required next:

- Structured JSON logs
- Request correlation IDs
- OpenTelemetry traces
- Worker metrics
- Queue depth metrics
- Preview CPU/memory tracking
- App generation quality dashboard

## 19. Deployment Targets

Supported:

- Docker Compose
- Vercel-ready Next.js output
- Railway-compatible API/worker split
- Supabase/Postgres-compatible database

Planned:

- Kubernetes manifests
- Cloudflare edge routing
- Managed Redis providers
- S3/R2 storage for generated artifacts
- Containerized preview sandboxes

## 20. Roadmap

### Level 10 Completion

- Dependency-aware resumable orchestration checkpoints
- Agent-to-agent review records persisted per generation
- Full generated-app validation matrix execution
- Playwright browser validation per preview
- Security and accessibility scanner adapters
- Cursor-level Monaco editor with streaming diffs
- Git-style rollback and change history
- One-click deployment with environment provisioning and health verification

### Level 5 Completion

- Real BullMQ worker for all generation/build/repair jobs
- PostgreSQL persistence for local agent-engine projects
- Redis-backed event streaming
- Queue dashboard
- Containerized previews

### Level 6

- Cursor-like streaming code editor
- File diff application UI
- AI pair-programming over generated app source
- Test runner integration
- Browser automation validation per generated app

### Level 7

- Kubernetes autoscaling
- Container-per-preview execution
- Resource quotas
- Per-tenant isolation
- Distributed build runners

### Level 8

- Self-evolving codebase proposals
- Automated refactor PR generation
- Architecture migration engine
- Continuous design evolution
- Quality regression prevention

## 21. Current Verification Status

Verified:

- TypeScript passes
- Lint has warnings only
- Production build passes
- `/api/health` returns 200
- `/api/evolution` returns 200
- Command center runs on port 3001
- Lazy Redis connection removes build-time Redis noise

Known warnings:

- Existing unused-symbol lint warnings in older modules
- Existing Turbopack NFT warning from dynamic project-service path tracing
