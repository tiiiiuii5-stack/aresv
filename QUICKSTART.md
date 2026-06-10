# Quick Start Guide - AI Software Factory

## Prerequisites

- Node.js 18+
- npm or yarn
- Ollama running locally (for AI model)

## Installation

```bash
# Clone repository
cd /path/to/dream

# Install dependencies
npm install

# Ensure Ollama is running
ollama serve
# In another terminal:
ollama pull llama3.2  # Or your preferred model
```

## Starting the Platform

### Development Mode

```bash
npm run dev
```

Server starts at: `http://localhost:3000`

### Access Points

1. **IDE Interface** (New!)
   - URL: `http://localhost:3000/ide`
   - Features: Chat, Editor, Preview, Logs, Jobs dashboard

2. **Original Builder UI** (Legacy)
   - URL: `http://localhost:3000`
   - Still available for backwards compatibility

### Production Mode

```bash
npm run build
npm start
```

---

## Core Features

### 1. Generate Apps

**Via IDE Chat**:
1. Open `http://localhost:3000/ide`
2. Type your app description in chat
3. Click "Generate"
4. Watch real-time progress

**Via API (Job Queue)**:
```bash
curl -X POST http://localhost:3000/api/agent/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Build a todo list app with dark mode",
    "stream": false,
    "model": "llama3.2"
  }'
```

Returns: `{ "jobId": "uuid", "status": "queued" }`

**Check Status**:
```bash
curl http://localhost:3000/api/agent/generate?jobId=<jobId>
```

### 2. Monitor Jobs

List all background jobs:
```bash
curl http://localhost:3000/api/agent/jobs
```

Get specific job:
```bash
curl http://localhost:3000/api/agent/jobs?id=<jobId>
```

Filter by action:
```bash
curl http://localhost:3000/api/agent/jobs?action=generate
```

### 3. Auto-Healing

When a build fails:
1. System detects error type
2. Applies repair strategy (npm install, eslint fix, etc.)
3. Rebuilds and tests
4. Repeats up to 5 times
5. Falls back to safe-mode if needed

**Trigger Repair**:
```bash
curl -X POST http://localhost:3000/api/agent/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "action": "repair",
    "appName": "my-app"
  }'
```

### 4. Real-Time Streaming

**Subscribe to app updates** (WebSocket):
```javascript
const ws = new WebSocket('ws://localhost:3000/ws/stream');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    appName: 'my-app'
  }));
};

ws.onmessage = (event) => {
  const { type, stage, message, timestamp } = JSON.parse(event.data);
  console.log(`[${stage}] ${message}`);
};
```

### 5. Project Memory

View app state:
```bash
cat generated-apps/my-app/.agent/state.json
```

Contains:
- Goal and stack
- Build history
- Error log with fixes attempted
- Agent action tracking
- Quality gates

### 6. Deployment

Prepare for Vercel:
```bash
curl -X POST http://localhost:3000/api/agent/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "action": "deploy",
    "appName": "my-app",
    "target": "vercel"
  }'
```

Generated files:
- `vercel.json` - Deployment config
- `.env.example` - Environment variables
- Optimized production build

---

## Project Structure

```
dream/
├── app/
│   ├── ide/page.tsx              # 🎨 New Cursor-style IDE
│   ├── page.tsx                  # Original UI (legacy)
│   └── api/
│       └── agent/
│           ├── generate/route.ts # Generate endpoint
│           └── jobs/route.ts     # Job management
├── lib/
│   ├── types.ts                  # Type definitions
│   ├── agent-engine-enhanced.ts  # Core agent logic
│   ├── job-queue-enhanced.ts     # Job processing
│   ├── healing-engine.ts         # Auto-repair
│   ├── deployment-system.ts      # Deploy config
│   ├── websocket-stream.ts       # Real-time streaming
│   ├── agent-bus.js              # Event bus
│   └── agent-engine.ts           # Original engine
├── generated-apps/               # Generated projects live here
│   ├── my-app/
│   │   ├── app/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── .agent/
│   │       └── state.json        # 💾 Project memory
│   └── .system/
│       └── jobs/                 # Job persistence
├── server.mjs                    # HTTP + WebSocket server
├── ARCHITECTURE.md               # Full architecture docs
└── package.json
```

---

## Example Workflows

### Workflow 1: Generate + Deploy

```bash
# 1. Generate app
JOB_ID=$(curl -s -X POST http://localhost:3000/api/agent/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Todo app","stream":false}' | jq -r '.jobId')

# 2. Wait for completion (poll)
while true; do
  STATUS=$(curl -s http://localhost:3000/api/agent/generate?jobId=$JOB_ID | jq -r '.status')
  if [ "$STATUS" = "succeeded" ]; then
    echo "✓ Generation complete"
    break
  fi
  sleep 2
done

# 3. Deploy to Vercel
curl -X POST http://localhost:3000/api/agent/jobs \
  -H "Content-Type: application/json" \
  -d '{"action":"deploy","appName":"todo-app","target":"vercel"}'
```

### Workflow 2: Fix Broken App

```bash
# 1. Try to build
curl -X POST http://localhost:3000/api/agent/jobs \
  -H "Content-Type: application/json" \
  -d '{"action":"build","appName":"broken-app"}'

# 2. If it fails, auto-repair triggers
# (System detects error → applies fix → rebuilds)

# 3. Monitor repair progress
curl http://localhost:3000/api/agent/jobs?action=repair
```

### Workflow 3: Real-Time IDE Development

```javascript
// Open IDE at http://localhost:3000/ide
// 1. Type prompt in chat: "Build a weather app"
// 2. Click Generate
// 3. Watch progress in real-time:
//    - planning (10%)
//    - generating (25%)
//    - writing_files (40%)
//    - installing (55%)
//    - building (75%)
//    - testing (85%)
//    - fixing (90%)
//    - ready (100%)
// 4. See logs stream in real-time
// 5. View jobs in dashboard
```

---

## Environment Variables

```bash
# .env.local (create this file)

# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Server
NODE_ENV=development
PORT=3000
HOSTNAME=localhost

# Optional: Deployment targets
VERCEL_TOKEN=your_token
AZURE_RESOURCE_GROUP=your_rg
NETLIFY_SITE_ID=your_site_id
```

---

## Performance Tips

### Faster Builds

1. **Use SSD** for app directory
2. **Increase Ollama timeout** if needed
3. **Pre-install node_modules** globally
4. **Cache Docker layers** if using Docker

### Reduced Repair Time

1. **Good error messages** from initial generation
2. **Dependencies pre-validated** before install
3. **Use safe-mode caching** to skip full regen

### Better Quality Apps

1. **Detailed prompts** = better generation
2. **Stack specification** speeds up generation
3. **Example UIs** in prompt for reference

---

## Troubleshooting

### Jobs Not Running

```bash
# Check job queue
curl http://localhost:3000/api/agent/jobs

# Restart server
npm run dev

# Check logs for worker startup message
```

### WebSocket Connection Failed

```bash
# Verify WebSocket is working
wscat -c ws://localhost:3000/ws/stream

# Check firewall
# Verify hostname/port in browser console
```

### Ollama Connection Error

```bash
# Verify Ollama is running
curl http://localhost:11434/api/tags

# Ensure model is installed
ollama pull llama3.2

# Check OLLAMA_URL in environment
echo $OLLAMA_URL
```

### Build Fails Repeatedly

```bash
# Check project memory for error history
cat generated-apps/my-app/.agent/state.json | jq '.errors'

# View last build attempt
curl http://localhost:3000/api/agent/jobs?action=build

# Check if repair attempted
curl http://localhost:3000/api/agent/jobs?action=repair
```

---

## Advanced Usage

### Custom Agent Prompts

Modify system prompt in `server.mjs`:

```javascript
const systemPrompt = `
You are an expert AI App Builder...
[Your custom instructions]
`;
```

### Repair Strategies

Add custom repair strategy in `lib/healing-engine.ts`:

```typescript
repairStrategies.push({
  name: "Custom Fixer",
  errorType: "build",
  canHandle: (error) => error.includes("my-error"),
  fix: async (appDir) => {
    // Your fix logic
  }
});
```

### Custom Deployment Targets

Extend `lib/deployment-system.ts`:

```typescript
export async function generateCustomConfig(appDir: string) {
  // Generate your deployment config
}
```

---

## Performance Monitoring

View job metrics:
```bash
curl http://localhost:3000/api/agent/jobs | jq '.[] | {action, status, progress}'
```

Check build history:
```bash
cat generated-apps/my-app/.agent/state.json | jq '.build_history'
```

---

## Support & Documentation

- **Architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md)
- **API Reference**: `/api/agent/*` endpoints
- **Type Definitions**: `lib/types.ts`
- **Examples**: Check job responses in `/api/agent/jobs`

---

## Next Steps

1. Start server: `npm run dev`
2. Open IDE: `http://localhost:3000/ide`
3. Generate your first app!
4. Monitor in Jobs dashboard
5. Check project memory for details
6. Deploy when ready!

Happy building! 🚀
