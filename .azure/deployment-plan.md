# VentureOS Azure Migration Deployment Plan

> **Status:** Planning - Azure CLI unavailable locally

Generated: 2026-06-11

---

## 1. Project Overview

**Goal:** Move VentureOS from a Vercel/serverless launch setup to an Azure platform that can support sustained traffic, persistent reports, GitHub scans, Redis-backed rate limits, background workers, and durable certificate/registry records.

**Path:** Modernize existing Next.js application.

---

## 2. Requirements

| Attribute | Value |
|-----------|-------|
| Classification | Production launch platform |
| Scale | Medium, with autoscale path |
| Budget | Balanced |
| Subscription | Not detected - `az` and `azd` are not installed on this machine |
| Location | Recommended: `eastus2`; must be confirmed before resource creation |

---

## 3. Components Detected

| Component | Type | Technology | Path |
|-----------|------|------------|------|
| VentureOS web app | Frontend + SSR API | Next.js 16, React 19, TypeScript | `app/`, `components/`, `lib/` |
| App API routes | API | Next.js route handlers | `app/api/**/route.ts` |
| Persistence layer | Database client | Prisma 7 + PostgreSQL adapter | `prisma/schema.prisma`, `lib/persistence/database.ts` |
| Queue layer | Worker / queue | BullMQ + Redis | `lib/queue.ts`, `lib/github/queue.ts`, `scripts/*worker*.ts` |
| Background worker | Worker | Node/TSX scripts | `scripts/build-worker.ts`, `scripts/github-scan-worker.ts` |
| GitHub integration | External integration | GitHub App + webhooks | `app/api/github/**`, `lib/github/**` |
| Certificate system | Signing service | Node crypto + DB persistence | `lib/certificates/**` |
| Product telemetry | API/logging | Vercel logs today, DB later | `app/api/product-events/route.ts` |

---

## 4. Recipe Selection

**Selected:** AZD (Bicep)

**Rationale:**

- This is an Azure-first migration.
- The app needs multiple managed resources and two containers.
- AZD gives repeatable environment management once `azd` is installed.
- Bicep is sufficient; no multi-cloud Terraform requirement was requested.

---

## 5. Architecture

**Stack:** Containers on Azure Container Apps.

### Service Mapping

| Component | Azure Service | SKU / Shape |
|-----------|---------------|-------------|
| Public Next.js web app | Azure Container Apps | Consumption, min replicas 1, max replicas 10 |
| Background job worker | Azure Container Apps | Internal worker container, min replicas 1, max replicas 5 |
| Container images | Azure Container Registry | Basic |
| Primary database | Azure Database for PostgreSQL Flexible Server | Burstable/General Purpose launch tier, exact SKU confirmed during provisioning |
| Queue + rate limit store | Azure Cache for Redis | Standard C1 recommended |
| Evidence/report artifacts | Azure Storage Account + Blob containers | Standard LRS |
| Secrets | Azure Key Vault | Standard |
| Logs | Log Analytics Workspace | Pay-as-you-go |
| APM | Application Insights | Workspace-based |
| Identity | Managed Identity | System-assigned identities for web and worker |

### Runtime Environment

| Variable | Azure Source |
|----------|--------------|
| `DATABASE_URL` | Key Vault secret from PostgreSQL connection string |
| `REDIS_URL` | Key Vault secret from Azure Cache for Redis |
| `DATABASE_DISABLED` | Set to `false` after DB migration succeeds |
| `NEXT_PUBLIC_APP_URL` | Container App public URL or custom domain |
| `APP_URL` | Container App public URL or custom domain |
| `APP_URL_ALLOWLIST` | Public URL/custom domain |
| `GITHUB_APP_*` | Key Vault secrets |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` | Key Vault secret |
| `STRIPE_*` | Optional; leave unset while app is free |
| certificate signing keys | Key Vault secrets |

---

## 6. Provisioning Limit Checklist

**Purpose:** Validate that the selected subscription and region have sufficient quota/capacity for all resources.

Quota validation cannot be completed on this machine yet because neither `az` nor `azd` is installed.

| Resource Type | Number to Deploy | Total After Deployment | Limit/Quota | Notes |
|---------------|------------------|------------------------|-------------|-------|
| Microsoft.App/managedEnvironments | 1 | Not checked | Not checked | Requires Azure CLI + subscription |
| Microsoft.App/containerApps | 2 | Not checked | Not checked | Web app + worker |
| Microsoft.ContainerRegistry/registries | 1 | Not checked | Not checked | ACR Basic |
| Microsoft.DBforPostgreSQL/flexibleServers | 1 | Not checked | Not checked | Persistent VentureOS database |
| Microsoft.Cache/Redis | 1 | Not checked | Not checked | Redis-backed queues and rate limits |
| Microsoft.Storage/storageAccounts | 1 | Not checked | Not checked | Evidence/report artifacts |
| Microsoft.KeyVault/vaults | 1 | Not checked | Not checked | Secrets |
| Microsoft.OperationalInsights/workspaces | 1 | Not checked | Not checked | Logs |
| Microsoft.Insights/components | 1 | Not checked | Not checked | App Insights |

**Status:** Blocked until Azure CLI is installed and authenticated.

---

## 7. Execution Checklist

### Phase 1: Planning

- [x] Analyze workspace
- [x] Gather requirements from current app behavior
- [ ] Confirm subscription and location with user
- [x] Prepare resource inventory
- [ ] Fetch quotas and validate capacity
- [x] Scan codebase
- [x] Select recipe
- [x] Plan architecture
- [ ] User approved this plan

### Phase 2: Execution

- [ ] Install/use Azure CLI and Azure Developer CLI
- [ ] Generate Dockerfile for web container
- [ ] Generate Dockerfile for worker container
- [ ] Generate `.dockerignore`
- [ ] Generate `azure.yaml`
- [ ] Generate `infra/main.bicep`
- [ ] Generate Container Apps definitions
- [ ] Generate Key Vault secret references
- [ ] Generate deployment notes for env migration
- [ ] Update plan status to `Ready for Validation`

### Phase 3: Validation

- [ ] Invoke azure-validate skill
- [ ] Validate local Docker build
- [ ] Validate Next.js production build
- [ ] Validate Bicep/AZD config
- [ ] Validate required env variables
- [ ] Validate quota/capacity

### Phase 4: Deployment

- [ ] Invoke azure-deploy skill
- [ ] Provision resources
- [ ] Build and push container images
- [ ] Run Prisma migrations
- [ ] Deploy web app
- [ ] Deploy worker
- [ ] Verify health endpoint
- [ ] Verify free review flow
- [ ] Verify report persistence
- [ ] Verify GitHub scan queue

---

## 8. Validation Proof

| Check | Command Run | Result | Timestamp |
|-------|-------------|--------|-----------|
| Workspace scan | `package.json`, `next.config.mjs`, `docker-compose.yml`, `prisma/schema.prisma` inspected | Pass | 2026-06-11 |
| Azure CLI availability | `az account show` | Blocked: `az` not installed | 2026-06-11 |
| Azure Developer CLI availability | `azd env list` | Blocked: `azd` not installed | 2026-06-11 |

**Validated by:** Pending azure-validate skill after artifacts are generated.

---

## 9. Files to Generate

| File | Purpose | Status |
|------|---------|--------|
| `.azure/deployment-plan.md` | Migration plan | Created |
| `.dockerignore` | Keep container build small | Pending approval |
| `docker/api.Dockerfile` | Next.js web/API container | Pending approval |
| `docker/worker.Dockerfile` | BullMQ/GitHub worker container | Pending approval |
| `azure.yaml` | AZD project config | Pending approval |
| `infra/main.bicep` | Azure infrastructure | Pending approval |
| `infra/main.parameters.json` | Deployment parameters | Pending approval |
| `docs/azure-migration-runbook.md` | Cutover and verification runbook | Pending approval |

---

## 10. Next Steps

Current phase: Planning blocked on Azure tooling/auth.

1. Confirm Azure subscription and region.
2. Install/login Azure CLI and Azure Developer CLI on this machine, or run the generated deployment from a machine that has them.
3. Generate container + Azure infrastructure files.
4. Validate.
5. Deploy.
