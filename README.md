# VentureOS - AI SaaS Builder

For the current production handoff, setup, environment variables, GitHub workflow, preview, and Vercel deployment steps, read [FINAL_EXPORT.md](./FINAL_EXPORT.md).

# 🚀 AI Software Factory - 10-Year Ahead Architecture

A production-grade autonomous software development platform that generates, builds, debugs, and deploys full applications with multi-agent AI coordination.

## ⚡ Key Features

### 🤖 Autonomous Generation
- **Multi-Agent System**: Builder, Fixer, Architect, UI agents
- **Intelligent Prompts**: Natural language → production code
- **Real-time Streaming**: Watch generation progress live
- **Project Memory**: Persistent state across sessions

### 🔧 Auto-Healing Engine
- **5-Cycle Repair Loop**: Automatic error detection and fix
- **Smart Strategies**: npm install, eslint fix, build optimization
- **Safe-Mode Fallback**: Guaranteed working state if repair fails
- **Error Classification**: Syntax, dependency, runtime, build errors

### 📊 Real-Time Orchestration
- **WebSocket Streaming**: Live status updates
- **Job Queue System**: Background processing with persistence
- **Progress Tracking**: Stage-based progress indicators
- **Multi-Action Support**: Generate, verify, repair, preview, build, deploy

### 🎨 Cursor-Style IDE Interface
- **Chat Panel**: Natural AI conversation
- **Code Editor**: Monaco editor with file browsing
- **Live Preview**: Sandbox iframe with auto-refresh
- **Logs Dashboard**: Real-time build output
- **Jobs Monitor**: Background task tracking

### 🌐 Production Deployment
- **Multi-Target Support**: Vercel, Netlify, Azure, Docker
- **Environment Config**: Auto-generated .env templates
- **CI/CD Ready**: Pipeline files generated
- **Vercel-Optimized**: Next.js 14 App Router best practices

## 📋 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│               Frontend (Cursor-Style IDE)                   │
│  Chat | Editor | Preview | Logs | Jobs                      │
└───────────────────────┬─────────────────────────────────────┘
                        │ Real-time WebSocket + REST
┌───────────────────────▼─────────────────────────────────────┐
│           Backend Orchestration Engine                       │
│  ┌─────────────┬───────────────┬─────────────┬────────────┐ │
│  │  Job Queue  │  Agent Engine │   Healing   │Deployment │ │
│  │  (Priority) │  (Multi-Agent)│  (Auto-Fix) │ (Vercel)  │ │
│  └─────────────┴───────────────┴─────────────┴────────────┘ │
└───────────────────────┬─────────────────────────────────────┘
         ┌──────────────┼──────────────┐
         │              │              │
    Generated       Project          Sandbox
    Apps            Memory           Preview
```

## 🎯 Quick Start

### Installation

```bash
# Clone and install
git clone <repo>
cd dream
npm install

# Ensure Ollama is running
ollama serve
ollama pull llama3.2
```

### Launch

```bash
npm run dev
```

- **IDE**: http://localhost:3000/ide
- **API**: http://localhost:3000/api/agent/*
- **WebSocket**: ws://localhost:3000/ws/stream

## 📚 Usage Examples

### Generate an App (UI)

1. Open http://localhost:3000/ide
2. Type: "Build a todo app with dark mode"
3. Click "Generate"
4. Watch real-time progress
5. Preview in sandbox

### Generate an App (API)

```bash
curl -X POST http://localhost:3000/api/agent/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Todo app with authentication",
    "stream": false,
    "model": "llama3.2"
  }'

# Returns: { "jobId": "uuid", "status": "queued" }

# Check status
curl http://localhost:3000/api/agent/generate?jobId=<jobId>
```

### Monitor Jobs

```bash
# List all jobs
curl http://localhost:3000/api/agent/jobs

# Get specific job
curl http://localhost:3000/api/agent/jobs?id=<jobId>

# Filter by action
curl http://localhost:3000/api/agent/jobs?action=generate
```

### Real-Time WebSocket Streaming

```javascript
const ws = new WebSocket('ws://localhost:3000/ws/stream');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    appName: 'my-app'
  }));
};

ws.onmessage = (event) => {
  const { stage, message, timestamp } = JSON.parse(event.data);
  console.log(`[${stage}] ${message}`);
};
```

### Deploy to Vercel

```bash
curl -X POST http://localhost:3000/api/agent/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "action": "deploy",
    "appName": "my-app",
    "target": "vercel"
  }'
```

## 🔄 Auto-Healing Workflow

When a build fails:

```
1. Detect Error Type
   ├─ Syntax → eslint --fix
   ├─ Dependency → npm install --legacy-peer-deps
   ├─ Build → Clean rebuild
   └─ Runtime → Diagnostic checks

2. Apply Repair Strategy (Cycle 1-5)
   ├─ Run fix command
   ├─ Test build
   └─ If successful, done ✓

3. Safe-Mode Fallback (if all cycles fail)
   ├─ Generate minimal Next.js 14 app
   ├─ Test minimal build
   └─ User can rebuild from clean state
```

## 💾 Project Memory System

Each project persists state at: `generated-apps/<app>/.agent/state.json`

```json
{
  "goal": "User's app description",
  "stack": ["nextjs", "typescript", "tailwind"],
  "build_history": [
    {
      "at": "2024-01-01T12:00:00Z",
      "ok": true,
      "step": "build",
      "durationMs": 4500,
      "errors": 0
    }
  ],
  "errors": [
    {
      "timestamp": "2024-01-01T12:00:00Z",
      "type": "dependency",
      "message": "Cannot find module 'lodash'",
      "fixed": true
    }
  ],
  "fix_attempts": 2,
  "last_success": "2024-01-01T12:05:00Z",
  "agents": {
    "builder": { "status": "idle", "last_action": "created app" },
    "fixer": { "status": "idle", "last_action": "resolved deps" },
    "architect": { "status": "idle", "last_action": "designed structure" },
    "ui": { "status": "idle", "last_action": "optimized styles" }
  }
}
```

Enables:
- ✅ Continuous development across sessions
- ✅ Error pattern analysis
- ✅ Build success tracking
- ✅ Agent action logging
- ✅ Quality gate monitoring

## 🏗️ API Reference

### Generate Endpoint
```
POST /api/agent/generate
GET /api/agent/generate?jobId=<id>
```

### Jobs Endpoint
```
GET /api/agent/jobs
GET /api/agent/jobs?id=<id>
GET /api/agent/jobs?action=generate|verify|repair|build|deploy
POST /api/agent/jobs
DELETE /api/agent/jobs?id=<id>
```

### WebSocket
```
ws://localhost:3000/ws/stream
- subscribe { type: 'subscribe', appName: 'app-name' }
- unsubscribe { type: 'unsubscribe', appName: 'app-name' }
- ping { type: 'ping' }
```

## 📊 Stage Progression

Real-time progress tracking:

```
idle          0%   ⚪
planning      10%  🔵
generating    25%  🔵
writing_files 40%  🔵
installing    55%  🔵
building      75%  🔵
testing       85%  🔵
fixing        90%  🟡
ready         100% 🟢
```

## 🛠️ Supported Deployment Targets

1. **Vercel** (Recommended)
   - Auto-deployments from git
   - Environment variable support
   - Optimized for Next.js

2. **Netlify**
   - JAMstack deployment
   - Function support
   - Automatic redirects for SPA

3. **Azure**
   - App Service deployment
   - CI/CD pipeline generation
   - Enterprise compliance

4. **Docker**
   - Multi-stage Dockerfile
   - Production-optimized images
   - Container orchestration ready

## 📁 Project Structure

```
dream/
├── app/
│   ├── ide/page.tsx                    # 🎨 New Cursor IDE
│   ├── page.tsx                        # Legacy UI
│   └── api/agent/
│       ├── generate/route.ts           # Generation endpoint
│       └── jobs/route.ts               # Job management
├── lib/
│   ├── types.ts                        # Type system
│   ├── agent-engine-enhanced.ts        # Core AI engine
│   ├── job-queue-enhanced.ts           # Job processor
│   ├── healing-engine.ts               # Auto-repair
│   ├── deployment-system.ts            # Deploy config
│   ├── websocket-stream.ts             # Real-time updates
│   └── agent-bus.js                    # Event bus
├── generated-apps/                     # Generated projects
│   ├── my-app/
│   │   ├── app/                        # Next.js app
│   │   ├── package.json
│   │   └── .agent/state.json           # 💾 Project memory
│   └── .system/jobs/                   # Job persistence
├── server.mjs                          # Main server
├── ARCHITECTURE.md                     # Full technical docs
├── QUICKSTART.md                       # Getting started
└── package.json
```

## ⚙️ Configuration

### Environment Variables

```bash
# .env.local

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Server
NODE_ENV=development
PORT=3000
HOSTNAME=localhost

# Deployment (optional)
VERCEL_TOKEN=your_token
AZURE_RESOURCE_GROUP=your_rg
NETLIFY_SITE_ID=your_site_id
```

## 🎓 Key Concepts

### Job Queue System
- Non-blocking background processing
- Up to 5 automatic retries
- Persistent job history
- Real-time progress tracking

### Auto-Healing Engine
- Automatic error detection
- Strategic repair attempts (5 cycles)
- Safe-mode fallback (guaranteed working)
- Error classification and learning

### Project Memory
- Persistent application state
- Build history tracking
- Error log with attempted fixes
- Agent action audit trail
- Quality gate metrics

### Real-Time Streaming
- WebSocket event broadcasting
- Client subscription management
- Stage-based progress updates
- Live log streaming

## 🚀 Performance

- **Generation**: 5-30 seconds (model-dependent)
- **Installation**: 20-60 seconds (network-dependent)
- **Build**: 15-45 seconds (complexity-dependent)
- **Repair Cycle**: 30-120 seconds total
- **Fallback**: ~30 seconds (safe-mode generation)

## 🔒 Security

✅ Sandboxed preview environment  
✅ File integrity validation  
✅ Pre-install dependency checks  
✅ Isolated dev server processes  
✅ Environment variable isolation  

## 📖 Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Full technical architecture
- **[QUICKSTART.md](./QUICKSTART.md)** - Step-by-step guide
- **[lib/types.ts](./lib/types.ts)** - Type definitions
- **API Endpoints** - See inline documentation

## 🛠️ Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build Next.js app
npm start            # Start production server
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
npm run clean        # Clean build artifacts
npm run reset        # Full clean (including node_modules)
```

## 🐛 Troubleshooting

### Jobs Not Processing
```bash
# Check job queue
curl http://localhost:3000/api/agent/jobs

# Restart server
npm run dev
```

### Ollama Connection Error
```bash
# Verify Ollama is running
curl http://localhost:11434/api/tags

# Install model if needed
ollama pull llama3.2
```

### WebSocket Issues
```bash
# Test WebSocket endpoint
wscat -c ws://localhost:3000/ws/stream

# Check app subscription
# { "type": "subscribe", "appName": "my-app" }
```

## 🎯 Next Steps

1. ✅ Start server: `npm run dev`
2. ✅ Open IDE: http://localhost:3000/ide
3. ✅ Generate your first app
4. ✅ Monitor in jobs dashboard
5. ✅ Deploy to Vercel
6. ✅ Share with the world!

## 📝 License

This project is provided as-is for educational and commercial use.

## 🙋 Support

For issues, questions, or contributions:
1. Check [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details
2. Review [QUICKSTART.md](./QUICKSTART.md) for usage examples
3. Check endpoint responses for error details

---

**Built with:** Next.js 14 • TypeScript • Tailwind CSS • Ollama  
**Version:** 2.0.0 (10-Year Architecture)  
**Status:** Production-Ready 🚀
