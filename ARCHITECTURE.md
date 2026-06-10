# AI Software Factory - 10-Year Architecture Documentation

## Overview

This is a production-grade autonomous software development platform that generates, builds, debugs, and deploys full applications using multi-agent AI coordination.

## Architecture Layers

### 1. **Frontend (IDE Interface)**

**Location**: `/app/ide/page.tsx`

Ultra-clean Cursor-style interface with:
- **Chat Panel**: AI conversation with streaming output
- **Code Editor**: Monaco-based code viewing and editing
- **File Explorer**: Real-time project file browsing
- **Preview Pane**: Live sandbox preview (iframe)
- **Logs Panel**: Real-time build/debug output
- **Jobs Dashboard**: Background job status tracking

**Key Features**:
- Dark mode by default
- Real-time progress indicators
- Split-view editor/preview
- Streaming message updates
- Job polling (1s intervals)

### 2. **Backend (Orchestration Engine)**

**Core Modules**:

#### Agent Engine (`/lib/agent-engine-enhanced.ts`)
- Project generation and management
- File integrity hashing
- Error classification
- Auto-healing repair cycles
- Memory persistence

#### Job Queue System (`/lib/job-queue-enhanced.ts`)
- Background job processing
- Priority queuing
- Retry logic (up to 5 attempts)
- Job persistence and recovery
- Multi-action support:
  - `generate` - Create new app
  - `verify` - Test build
  - `repair` - Fix broken code
  - `preview` - Start dev server
  - `build` - Production build
  - `deploy` - Ship to production

#### Healing Engine (`/lib/healing-engine.ts`)
- Auto-repair strategies
- Safe-mode fallback
- Health checks
- Error detection

#### Deployment System (`/lib/deployment-system.ts`)
- Multi-target deployment (Vercel, Netlify, Azure, Docker)
- Environment configuration
- CI/CD pipeline generation

### 3. **Agent Layer (Multi-Agent System)**

**Agents**:

1. **Builder Agent**: Creates apps from prompts
2. **Fixer Agent**: Debugs and repairs broken code
3. **Architect Agent**: Plans system structure
4. **UI Agent**: Optimizes UI/UX (future)

**Agent State Tracking**: `/generated-apps/<project>/.agent/state.json`

```json
{
  "goal": "user's app description",
  "stack": ["nextjs", "typescript", "tailwind"],
  "build_history": [],
  "errors": [],
  "fix_attempts": 0,
  "architecture_notes": "",
  "last_success": "ISO timestamp",
  "file_graph": {},
  "agents": {
    "builder": { "status": "idle", "last_action": "" },
    "fixer": { "status": "idle", "last_action": "" },
    "architect": { "status": "idle", "last_action": "" },
    "ui": { "status": "idle", "last_action": "" }
  }
}
```

### 4. **Real-Time Streaming (WebSocket)**

**Location**: `/lib/websocket-stream.ts`

Endpoint: `ws://localhost:3000/ws/stream`

**Features**:
- Subscribe to app-specific updates
- Real-time status broadcasting
- Event streaming (logs, errors, updates)
- Client connection management
- Health ping/pong

**Event Types**:
```typescript
{
  type: "status" | "log" | "result" | "error" | "file_change",
  stage: "idle" | "planning" | "generating" | "writing_files" | "installing" | "building" | "testing" | "fixing" | "ready",
  message: string,
  timestamp: number,
  severity?: "info" | "warning" | "error"
}
```

---

## Auto-Healing Repair Cycle (Critical)

### Repair Loop Strategy

```
CYCLE 1-5: Attempt Repair
├─ Detect error type (syntax/runtime/dependency/build)
├─ Find matching repair strategy
├─ Apply fix (npm install, eslint --fix, rebuild)
├─ Test build success
└─ If failed, continue to next cycle

FALLBACK (Cycle 6+):
├─ Generate minimal Next.js 14 app
├─ Verify basic build works
└─ User can rebuild from clean state
```

### Error Classification

- **Syntax**: `SyntaxError`, `Unexpected token`
- **Dependency**: `Cannot find module`, `npm ERR!`, `ENOENT`
- **Runtime**: Connection/permission errors
- **Build**: Webpack/Next.js compilation failures
- **Unknown**: Fallback category

### Repair Strategies

1. **Dependency Resolver**: `npm install --legacy-peer-deps`
2. **Syntax Fixer**: `eslint --fix`
3. **Build Optimizer**: Clean rebuild with diagnostics

---

## Project Memory System

Each project persists metadata at: `.generated-apps/<projectName>/.agent/state.json`

**Enables**:
- Continuous development across sessions
- Error history and patterns
- Build success tracking
- Agent action logging
- Quality gate monitoring

**File Integrity Map**:
```typescript
{
  "path/to/file.ts": {
    "hash": "sha256-hash",
    "size": 1024,
    "modified": 1234567890,
    "integrity": "valid" | "modified" | "missing"
  }
}
```

---

## Smart File Patch Engine

**Minimal Change Strategy**:
1. Hash each file
2. Detect only changed files
3. Skip unchanged files (preserves timestamps)
4. Only write modifications
5. Maintain file integrity map

**Operations**:
- `CREATE`: New file
- `UPDATE`: Modified file (diff-based)
- `DELETE`: Remove file (safe)

---

## Dependency Intelligence Engine

**Validation**:
- Next.js >= 14.2.0
- React >= 18.3.0
- Detect version conflicts
- Remove duplicates
- Enforce compatibility

**Safe Dependencies**:
```json
{
  "next": "^14.2.0",
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "typescript": "^5.5.0",
  "tailwindcss": "^3.4.0"
}
```

---

## Live Sandbox Preview

**Architecture**:
1. Child process runs `npm run dev` in app directory
2. Dev server binds to isolated port (3001-3100)
3. iframe displays preview at `http://localhost:PORT`
4. Auto-restart on crash
5. Hot reload file changes

**Features**:
- Error recovery and auto-restart
- File sync before reload
- Real-time log streaming
- Resource isolation

---

## Deployment System

### Supported Targets

1. **Vercel** (Recommended)
   - Generates `vercel.json`
   - Automatic deployments
   - Environment variable setup

2. **Netlify**
   - Generates `netlify.toml`
   - Redirect rules for SPA
   - Function support

3. **Azure**
   - Generates `azure-pipelines.yml`
   - App Service deployment
   - CI/CD pipeline ready

4. **Docker**
   - Multi-stage Dockerfile
   - Production-optimized image
   - `.dockerignore` configuration

**Preparation**:
```typescript
await prepareDeployment(appDir, "vercel");
// Generates:
// - vercel.json
// - .env.example
// - Build configuration
```

---

## Job Queue System

### Architecture

```
Request → Create Job → Queue → Worker Loop → Execute → Persist
```

### Job States

- `queued`: Waiting in queue
- `running`: Currently executing
- `succeeded`: Completed successfully
- `failed`: Execution failed
- `cancelled`: User cancelled

### Job Persistence

- **Path**: `.generated-apps/.system/jobs/`
- **Format**: JSON files per job
- **Recovery**: Auto-resume after server restart

### Retry Logic

- Up to 5 attempts per job
- Exponential backoff between retries
- Failed jobs marked as `failed`
- Non-generate jobs auto-retry

---

## API Endpoints

### Generate Project
```
POST /api/agent/generate
{
  "prompt": "Build a todo app",
  "model": "llama3.2",
  "appName": "my-todo-app",
  "stream": false  // true for streaming, false for job queue
}
```

### List/Manage Jobs
```
GET /api/agent/jobs                    // List all jobs
GET /api/agent/jobs?id=<jobId>         // Get specific job
GET /api/agent/jobs?action=generate    // Filter by action
POST /api/agent/jobs                   // Create new job
DELETE /api/agent/jobs?id=<jobId>      // Delete job
```

### Job Details
```
{
  "id": "uuid",
  "action": "generate|verify|repair|preview|build|deploy",
  "status": "queued|running|succeeded|failed",
  "stage": "idle|planning|generating|...|ready",
  "progress": 0-100,
  "message": "Current status message",
  "events": [],
  "result": {},
  "error": "Error message if failed"
}
```

---

## Stage Progression

Real-time progress mapping:

```
idle          (0%)
planning      (10%)
generating    (25%)
writing_files (40%)
installing    (55%)
building      (75%)
testing       (85%)
fixing        (90%)
ready         (100%)
```

---

## Configuration

### Environment Variables

```bash
# Ollama Configuration
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Server
NODE_ENV=production
HOSTNAME=localhost
PORT=3000

# Optional: Deployment
VERCEL_TOKEN=token
AZURE_RESOURCE_GROUP=rg-name
```

### Next.js Config

- TypeScript support
- App Router (Next.js 14)
- Tailwind CSS
- PostCSS auto-prefixing
- Fast Refresh enabled

---

## Development Workflow

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Access IDE
http://localhost:3000/ide

# Access WebSocket stream (diagnostic)
ws://localhost:3000/ws/stream
```

### Production Build

```bash
# Build Next.js
npm run build

# Start production server
npm start
```

---

## Monitoring & Debugging

### Job Logs

Located at: `.generated-apps/.system/jobs/<jobId>.json`

### Project Memory

Located at: `.generated-apps/<projectName>/.agent/state.json`

### Build History

Stored in project memory's `build_history` array

### Error Tracking

Stored in project memory's `errors` array with:
- Type (syntax/runtime/dependency/build)
- Message
- Timestamp
- Fix status

---

## Performance Characteristics

- **Generation**: 5-30 seconds (model dependent)
- **Install**: 20-60 seconds (network dependent)
- **Build**: 15-45 seconds (app complexity dependent)
- **Repair**: 10-120 seconds (cycles × strategy time)
- **Fallback**: ~30 seconds (safe-mode generation)

---

## Security Considerations

1. **Sandboxed Preview**: Child processes isolated
2. **Safe File Operations**: Integrity validation
3. **Dependency Validation**: Pre-install checks
4. **Environment Isolation**: Separate .env files
5. **Command Execution**: Controlled via prepared strategies

---

## Future Enhancements

1. **Multi-Agent Orchestration**: Parallel agent execution
2. **Continuous Learning**: Repair patterns ML training
3. **Advanced UI Generation**: CSS/UX optimization agent
4. **Performance Profiling**: Lighthouse integration
5. **Database Migrations**: Schema versioning
6. **Testing Framework**: Automated test generation
7. **Analytics**: Usage pattern analysis
8. **Team Collaboration**: Real-time co-development

---

## Troubleshooting

### Jobs Not Processing

```bash
# Check job queue
curl http://localhost:3000/api/agent/jobs

# Check if worker is running
# Look for "Job worker started" in logs
```

### Build Failures

```bash
# Check project memory for errors
cat generated-apps/<projectName>/.agent/state.json

# Review build history
# Check repair session logs
```

### WebSocket Connection Issues

```bash
# Verify WebSocket endpoint
ws://localhost:3000/ws/stream

# Check client subscriptions
# Verify app name matches
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (IDE UI)                        │
│  Chat | Editor | Preview | Logs | Jobs Dashboard            │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    Real-time Updates
                      (REST + WS)
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  Backend Orchestration                       │
│  ┌─────────────┬──────────────┬─────────────┬────────────┐  │
│  │ Job Queue   │ Agent Engine │ Healing     │ Deployment │  │
│  │ System      │ (Builder/    │ Engine      │ System     │  │
│  │             │  Fixer/      │ (Repair)    │            │  │
│  │ Processors  │  Architect)  │ (Safe Mode) │ (Vercel/   │  │
│  │             │              │             │  Docker)   │  │
│  └─────────────┴──────────────┴─────────────┴────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
┌───────▼──────┐  ┌────────▼────────┐ ┌──────▼──────────┐
│  Generated   │  │  Project Memory │ │  Sandbox Dev   │
│  Apps        │  │  (.agent/)      │ │  Server        │
│  (File Tree) │  │  State & History│ │  (npm run dev) │
└──────────────┘  └─────────────────┘ └────────────────┘
```

---

## Version History

- **v1.0.0** (Current): 10-year architecture foundation
  - Multi-agent system
  - Auto-healing engine
  - Real-time streaming
  - Project memory
  - Production deployment support

