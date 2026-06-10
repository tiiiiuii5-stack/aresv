# 📚 AI Software Factory - Complete Documentation Index

## 🎯 Start Here

### For First-Time Users
1. **[README.md](./README.md)** ← Overview & quick start
2. **[QUICKSTART.md](./QUICKSTART.md)** ← Step-by-step guide
3. **[http://localhost:3000/ide](http://localhost:3000/ide)** ← Open the IDE

### For Developers
1. **[FULL_APP_SPECS.md](./FULL_APP_SPECS.md)** ← Canonical product and system specs
2. **[ARCHITECTURE.md](./ARCHITECTURE.md)** ← Technical deep dive
3. **[lib/types.ts](./lib/types.ts)** ← Type definitions
4. **[IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md)** ← What was built

### For DevOps/Deployment
1. **[ARCHITECTURE.md#Deployment System](./ARCHITECTURE.md)** ← Deployment config
2. **[lib/deployment-system.ts](./lib/deployment-system.ts)** ← Implementation

---

## 📖 Documentation Files

### 1. **[FULL_APP_SPECS.md](./FULL_APP_SPECS.md)** - Canonical Full App Specs
**Purpose**: Complete product, architecture, infrastructure, AI runtime, sandbox, and roadmap specification  
**Contains**:
- Product definition
- Generation modes
- Runtime services
- Multi-agent system
- Infrastructure
- API specs
- Security, performance, observability
- Roadmap and verification status

**When to read**: Before building or changing major platform behavior

### 2. **[README.md](./README.md)** - Main Overview
**Purpose**: Feature overview and quick introduction  
**Length**: 400+ lines  
**Contains**:
- Key features overview
- Architecture diagram
- Usage examples
- Configuration
- Troubleshooting

**When to read**: First time, or share with others

### 3. **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Technical Reference
**Purpose**: Complete technical architecture  
**Length**: 500+ lines  
**Sections**:
- Architecture layers (frontend/backend/agents)
- Auto-healing repair cycle
- Project memory system
- Smart file patch engine
- Dependency intelligence
- Live sandbox preview
- Deployment system
- Job queue system
- API endpoints
- Stage progression
- Performance characteristics
- Security considerations
- Troubleshooting

**When to read**: Understanding how it works

### 4. **[QUICKSTART.md](./QUICKSTART.md)** - Getting Started Guide
**Purpose**: Step-by-step walkthrough  
**Length**: 300+ lines  
**Covers**:
- Installation
- Starting the platform
- Core features (6 workflows)
- API examples
- Project structure
- Environment variables
- Performance tips
- Troubleshooting with solutions
- Advanced usage

**When to read**: Setting up or first time using

### 5. **[IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md)** - What Was Built
**Purpose**: Complete list of implemented features  
**Length**: 400+ lines  
**Includes**:
- 12 implementation phases
- 68 features organized by category
- Quality gates
- Status summary table
- Testing checklist
- Deployment checklist

**When to read**: Understanding scope and completeness

### 6. **[COMPLETE.md](./COMPLETE.md)** - Completion Summary
**Purpose**: Summary of all work done  
**Length**: 300+ lines  
**Highlights**:
- New files created
- Key components
- Code examples
- Performance metrics
- Security/reliability
- Getting started
- Next steps

**When to read**: Quick overview of delivery

---

## 💻 Source Code Structure

### Core Type System
```
lib/types.ts (450+ lines)
├── Stage & Status Types
├── Streaming Events
├── File & Project Types
├── Job Queue Types
├── Dependency Types
├── Agent Types
├── Repair Types
├── Deployment Types
└── UI State Types
```

### Agent Engine
```
lib/agent-engine-enhanced.ts (400+ lines)
├── File Integrity & Hashing
├── Project Memory Management
├── Streaming Event Broadcast
├── Smart File Patch Engine
├── Dependency Intelligence
├── Error Classification
├── Auto-Healing Repair Cycle
└── Build Command Execution
```

### Job Queue System
```
lib/job-queue-enhanced.ts (350+ lines)
├── Job Persistence (Save/Load/Delete/List)
├── Job Creation & Queuing
├── Job Execution Engine
├── 6 Job Handlers (generate/verify/repair/preview/build/deploy)
├── Worker Loop
└── Export Types
```

### Healing Engine
```
lib/healing-engine.ts (350+ lines)
├── Error Detection Engine
├── Repair Strategies Framework
├── Safe-Mode Fallback Generator
├── Repair Session Executor
├── Health Check System
└── Error Recovery Flow
```

### Deployment System
```
lib/deployment-system.ts (250+ lines)
├── Vercel Config Generator
├── Netlify Config Generator
├── Azure Config Generator
├── Docker Config Generator
├── Environment Templates
├── Deployment Orchestration
└── Deployment Status Tracking
```

### WebSocket Streaming
```
lib/websocket-stream.ts (120+ lines)
├── WebSocket Server Initialization
├── Client Management
├── Event Broadcasting
├── Connection Health Monitoring
└── Client Count Tracking
```

### Frontend IDE
```
app/ide/page.tsx (600+ lines)
├── Main IDE Component (React)
├── Left Sidebar (Projects/Files)
├── Tab Bar Navigation
├── Chat Pane (Message streaming)
├── Logs Pane (Build output)
├── Jobs Pane (Background tasks)
├── Editor Pane (File editing)
├── Preview Pane (Live sandbox)
├── Status Bar (Progress/metrics)
└── Styling (Ultra-clean dark mode)
```

### API Routes
```
app/api/agent/
├── generate/route.ts (Updated)
│   ├── POST - Create generation job
│   ├── GET - Check job status
│   └── Job queue support
└── jobs/route.ts (Updated)
    ├── GET - List jobs
    ├── POST - Create job
    └── DELETE - Delete job
```

---

## 🎯 Use Cases & Documentation

### Use Case: Generate an App
**Read**: [QUICKSTART.md#Workflow 1](./QUICKSTART.md)  
**API**: POST `/api/agent/generate`  
**UI**: http://localhost:3000/ide → Type prompt → Generate

### Use Case: Fix a Broken App
**Read**: [ARCHITECTURE.md#Auto-Healing](./ARCHITECTURE.md)  
**Process**: Error detected → Repair strategies applied (1-5 cycles) → Safe-mode fallback if needed  
**Job**: `repair` action in job queue

### Use Case: Monitor Progress
**Read**: [QUICKSTART.md#Real-Time Streaming](./QUICKSTART.md)  
**Protocol**: WebSocket at `ws://localhost:3000/ws/stream`  
**Subscribe**: `{ type: 'subscribe', appName: 'my-app' }`

### Use Case: Deploy to Production
**Read**: [ARCHITECTURE.md#Deployment](./ARCHITECTURE.md)  
**Targets**: Vercel, Netlify, Azure, Docker  
**API**: POST `/api/agent/jobs` with `action: 'deploy'`

### Use Case: Understand Architecture
**Read**: [ARCHITECTURE.md](./ARCHITECTURE.md)  
**Types**: [lib/types.ts](./lib/types.ts)  
**Diagram**: [ARCHITECTURE.md#Architecture Diagram](./ARCHITECTURE.md)

### Use Case: Troubleshoot Issues
**Read**: [QUICKSTART.md#Troubleshooting](./QUICKSTART.md)  
**Also**: [ARCHITECTURE.md#Troubleshooting](./ARCHITECTURE.md)

---

## 🔍 Quick Reference Tables

### File Locations
| Component | File | Lines |
|-----------|------|-------|
| Types | `lib/types.ts` | 450+ |
| Agent Engine | `lib/agent-engine-enhanced.ts` | 400+ |
| Job Queue | `lib/job-queue-enhanced.ts` | 350+ |
| Healing | `lib/healing-engine.ts` | 350+ |
| Deployment | `lib/deployment-system.ts` | 250+ |
| WebSocket | `lib/websocket-stream.ts` | 120+ |
| IDE UI | `app/ide/page.tsx` | 600+ |
| API Generate | `app/api/agent/generate/route.ts` | 150+ |
| API Jobs | `app/api/agent/jobs/route.ts` | 120+ |

### Documentation
| Doc | Purpose | Lines | Read When |
|-----|---------|-------|-----------|
| README.md | Overview | 400+ | Starting out |
| ARCHITECTURE.md | Technical details | 500+ | Deep understanding |
| QUICKSTART.md | Step-by-step | 300+ | First-time setup |
| IMPLEMENTATION_CHECKLIST.md | What was built | 400+ | Understanding scope |
| COMPLETE.md | Completion summary | 300+ | Quick overview |

### API Endpoints
| Method | Endpoint | Purpose | Response |
|--------|----------|---------|----------|
| POST | `/api/agent/generate` | Create generation job | `{ jobId, status }` |
| GET | `/api/agent/generate?jobId=X` | Check job status | `AgentJob` |
| GET | `/api/agent/jobs` | List all jobs | `{ jobs: [] }` |
| GET | `/api/agent/jobs?id=X` | Get specific job | `AgentJob` |
| POST | `/api/agent/jobs` | Create any job | `{ job }` |
| DELETE | `/api/agent/jobs?id=X` | Delete job | `{ ok: true }` |

### WebSocket Events
| Event Type | Direction | Purpose | Example |
|-----------|-----------|---------|---------|
| subscribe | Client → Server | Subscribe to app updates | `{ type: 'subscribe', appName: 'my-app' }` |
| stream_event | Server → Client | Status/log update | `{ type: 'stream_event', stage: 'building', message: '...' }` |
| pong | Server → Client | Health check response | `{ type: 'pong' }` |

---

## 🚀 Common Tasks & Where to Find Help

### "I want to get started"
1. Install: `npm install`
2. Start: `npm run dev`
3. Read: [QUICKSTART.md](./QUICKSTART.md)
4. Generate: http://localhost:3000/ide

### "I want to understand the architecture"
Read: [ARCHITECTURE.md](./ARCHITECTURE.md)  
Then: [lib/types.ts](./lib/types.ts) for type details

### "I want to use the API directly"
Read: [ARCHITECTURE.md#API Endpoints](./ARCHITECTURE.md)  
See examples in: [QUICKSTART.md#Example Workflows](./QUICKSTART.md)

### "I want to know what was implemented"
Read: [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md)  
Or: [COMPLETE.md#What You Now Have](./COMPLETE.md)

### "I have an error or problem"
1. Check: [QUICKSTART.md#Troubleshooting](./QUICKSTART.md)
2. Also: [ARCHITECTURE.md#Troubleshooting](./ARCHITECTURE.md)
3. Then: Check logs at `generated-apps/<app>/.agent/state.json`

### "I want to add a feature"
1. Understand: [ARCHITECTURE.md](./ARCHITECTURE.md)
2. See patterns in: [lib/healing-engine.ts](./lib/healing-engine.ts) (for repair strategies)
3. Follow type system: [lib/types.ts](./lib/types.ts)

### "I want to deploy"
Read: [ARCHITECTURE.md#Deployment System](./ARCHITECTURE.md)  
See: [lib/deployment-system.ts](./lib/deployment-system.ts)  
Examples: [QUICKSTART.md#Workflow 1](./QUICKSTART.md)

---

## 📚 Reading Path by Role

### For Project Managers
1. [README.md](./README.md) - Overview
2. [COMPLETE.md](./COMPLETE.md) - What was delivered
3. [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) - Scope

### For Frontend Developers
1. [README.md](./README.md) - Overview
2. [QUICKSTART.md](./QUICKSTART.md) - Getting started
3. [app/ide/page.tsx](./app/ide/page.tsx) - UI implementation
4. [ARCHITECTURE.md#Frontend](./ARCHITECTURE.md) - Frontend architecture

### For Backend Developers
1. [ARCHITECTURE.md](./ARCHITECTURE.md) - Full architecture
2. [lib/types.ts](./lib/types.ts) - Type system
3. [lib/agent-engine-enhanced.ts](./lib/agent-engine-enhanced.ts) - Core logic
4. [QUICKSTART.md](./QUICKSTART.md) - API examples

### For DevOps/SRE
1. [ARCHITECTURE.md#Deployment](./ARCHITECTURE.md) - Deployment options
2. [lib/deployment-system.ts](./lib/deployment-system.ts) - Config generation
3. [QUICKSTART.md#Environment Variables](./QUICKSTART.md) - Configuration
4. [ARCHITECTURE.md#Performance](./ARCHITECTURE.md) - Scaling considerations

### For QA/Testing
1. [IMPLEMENTATION_CHECKLIST.md#Testing](./IMPLEMENTATION_CHECKLIST.md) - Test checklist
2. [ARCHITECTURE.md#API](./ARCHITECTURE.md) - API endpoints to test
3. [QUICKSTART.md](./QUICKSTART.md) - Usage examples

---

## 🎓 Learning Path

### Level 1: Beginner
- [ ] Read [README.md](./README.md)
- [ ] Follow [QUICKSTART.md](./QUICKSTART.md)
- [ ] Run `npm run dev`
- [ ] Generate first app via IDE

### Level 2: Intermediate
- [ ] Read [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ ] Study [lib/types.ts](./lib/types.ts)
- [ ] Test API endpoints
- [ ] Explore generated app structure

### Level 3: Advanced
- [ ] Deep dive into [lib/agent-engine-enhanced.ts](./lib/agent-engine-enhanced.ts)
- [ ] Study repair strategies in [lib/healing-engine.ts](./lib/healing-engine.ts)
- [ ] Understand job queue in [lib/job-queue-enhanced.ts](./lib/job-queue-enhanced.ts)
- [ ] Review [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md)

### Level 4: Expert
- [ ] Extend with custom repair strategies
- [ ] Add new deployment targets
- [ ] Implement team features
- [ ] Optimize performance

---

## 🔗 Cross-References

### Understanding Auto-Healing
- Overview: [README.md#Auto-Healing](./README.md)
- Architecture: [ARCHITECTURE.md#Auto-Healing](./ARCHITECTURE.md)
- Implementation: [lib/healing-engine.ts](./lib/healing-engine.ts)
- Types: [lib/types.ts#Repair Cycle Types](./lib/types.ts)

### Understanding Job Queue
- Overview: [README.md#Job Queue](./README.md)
- Architecture: [ARCHITECTURE.md#Job Queue](./ARCHITECTURE.md)
- Implementation: [lib/job-queue-enhanced.ts](./lib/job-queue-enhanced.ts)
- API: [ARCHITECTURE.md#API Endpoints](./ARCHITECTURE.md)

### Understanding Project Memory
- Overview: [README.md#Project Memory](./README.md)
- Architecture: [ARCHITECTURE.md#Project Memory](./ARCHITECTURE.md)
- Implementation: [lib/agent-engine-enhanced.ts](./lib/agent-engine-enhanced.ts)
- Schema: [lib/types.ts#ProjectMemoryState](./lib/types.ts)

---

## 📞 Support Map

| Question | Answer Location |
|----------|-----------------|
| How do I start? | [QUICKSTART.md](./QUICKSTART.md) |
| How does it work? | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| What was built? | [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) |
| How do I use the API? | [ARCHITECTURE.md#API](./ARCHITECTURE.md) or [QUICKSTART.md](./QUICKSTART.md) |
| How do I deploy? | [ARCHITECTURE.md#Deployment](./ARCHITECTURE.md) or [QUICKSTART.md#Workflow](./QUICKSTART.md) |
| How does repair work? | [ARCHITECTURE.md#Auto-Healing](./ARCHITECTURE.md) |
| What are the types? | [lib/types.ts](./lib/types.ts) |
| How do I troubleshoot? | [QUICKSTART.md#Troubleshooting](./QUICKSTART.md) |
| What if something fails? | [ARCHITECTURE.md#Troubleshooting](./ARCHITECTURE.md) |

---

**Generated**: 2024  
**Version**: 2.0.0  
**Status**: Complete & Production Ready  

**Total Documentation**: 2,000+ lines  
**Total Code**: 3,500+ lines  
**Total Files**: 15+ source files  

🚀 Ready to build amazing things!
