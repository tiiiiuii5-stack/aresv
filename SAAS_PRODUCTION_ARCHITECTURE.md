# SaaS Production Architecture

This document is the deployable architecture contract for the AI App Builder platform.

## Layer Map

```text
app/                       Next.js product shell and route handlers
lib/                       Control-plane services used by API routes
workers/                   Background execution process entrypoints
prisma/                    Persistent SaaS data model
docker/                    Container images for API and worker services
generated-apps/            Runtime workspace root, never imported by app code
```

## Runtime Boundaries

```text
Frontend
  Next.js App Router dashboard, editor, chat, logs, preview iframe.

API control plane
  Auth, project metadata, file access, job enqueue, WebSocket fanout.
  API routes must not execute generated application code.

Worker plane
  Runs queued jobs and all expensive execution:
  - AI generation
  - npm install
  - npm run build
  - repair loop
  - preview server lifecycle

Storage plane
  PostgreSQL: users, projects, jobs, builds, usage, subscriptions.
  Redis: production queue/session/event cache.
  File system or object storage: generated app workspaces and artifacts.
```

## Multi-Tenant Filesystem Contract

Production workspaces must use this shape:

```text
generated-apps/
  <userId>/
    <projectId>/
      app/
      package.json
      .agent/
        state.json
        logs/
```

Rules:

- All user-supplied paths are relative.
- Absolute paths are rejected.
- `..` path segments are rejected.
- Resolved paths must stay inside `generated-apps/<userId>/<projectId>`.
- API routes verify ownership before returning metadata or file contents.
- Workers receive `userId`, `projectId`, and job id. They do not infer ownership from path strings.

## Job Queue Contract

Production should run BullMQ + Redis. The current in-process queue is local/MVP only.

Job types:

```text
generate-app
install-deps
build-app
fix-app
run-preview
deploy-app
```

Required job fields:

```text
id
userId
projectId
type
status: queued | running | succeeded | failed | cancelled
progress: 0-100
attempts
maxAttempts
createdAt
startedAt
finishedAt
error
```

## Event Contract

WebSocket events:

```json
{ "type": "job:start", "jobId": "", "projectId": "", "message": "" }
{ "type": "job:progress", "jobId": "", "progress": 40, "stage": "building" }
{ "type": "job:log", "jobId": "", "message": "" }
{ "type": "job:complete", "jobId": "", "result": {} }
{ "type": "job:error", "jobId": "", "error": "" }
```

Existing platform status events remain supported:

```json
{ "type": "status", "stage": "building", "message": "running build..." }
```

## Deployment Topology

```text
Vercel or API container
  - Next.js frontend
  - API route handlers
  - WebSocket server when self-hosted

Worker containers
  - Horizontally scalable
  - Pull jobs from Redis
  - Execute generated app commands
  - Persist logs/results to PostgreSQL

PostgreSQL
  - System of record

Redis
  - Durable queue and realtime fanout

Object storage
  - Optional project archive/build artifact store
```

## Security Requirements

- Never execute generated app code in API route handlers.
- Never concatenate shell commands.
- Use fixed executable + argument arrays for process execution.
- Validate every AI file action before writing.
- Store secrets only in environment variables or a managed secret store.
- Enforce plan limits before enqueueing expensive jobs.
- Persist every failed build and repair attempt.

