# Performance Audit: Developer Quick Reference Card

## 🎯 Print This Out

---

## CRITICAL ISSUES CHECKLIST

### Issue 1: Job Queue (MOST CRITICAL)
```
Current: const queue: string[] = [];
Problem: Polling waste, single worker, no persistence
Fix:     Use BullMQ Redis queue
Time:    2-3 hours
Impact:  10x throughput increase
```
**File:** `lib/job-queue-enhanced.ts`  
**Lines:** 22-27, start section

---

### Issue 2: File Hashing (HIGH PRIORITY)
```
Current: Sequential SHA256 on every operation
Problem: 500ms per 100 files, blocks main thread
Fix:     Add cache + parallel + MD5
Time:    1-2 hours
Impact:  5x faster hashing
```
**File:** `lib/agent-engine-enhanced.ts`  
**Lines:** 37-108

---

### Issue 3: Repair Cycles (HIGH PRIORITY)
```
Current: for (let i = 1; i <= 5; i++) { full build }
Problem: 12 minutes on syntax errors (unrecoverable)
Fix:     Adaptive with confidence threshold
Time:    2-3 hours
Impact:  6x faster on errors
```
**File:** `lib/agent-engine-enhanced.ts`  
**Lines:** 298-370

---

### Issue 4: WebSocket (MEMORY LEAK)
```
Current: No heartbeat, zombie cleanup
Problem: 100-500KB per dead connection
Fix:     Add ping/pong + auto-cleanup
Time:    2-3 hours
Impact:  Fixes memory leak
```
**File:** `lib/websocket-stream.ts`

---

### Issue 5: Frontend Polling (UX IMPACT)
```
Current: fetch("/api/agent/jobs") every 1000ms
Problem: 60 HTTP/min, 60 re-renders/min
Fix:     Use WebSocket (already exists!)
Time:    3-4 hours
Impact:  80% fewer renders
```
**File:** `app/ide/page.tsx`  
**Lines:** 73-84

---

## SECONDARY ISSUES (NEXT SPRINT)

| Issue | File | Problem | Fix Time |
|-------|------|---------|----------|
| npm install cache | workers/bullmq-worker.mjs | Every build 2-3min | npm ci, 1h |
| Process cleanup | lib/agent-engine-enhanced.ts | Orphans accumulate | process groups, 1h |
| DB N+1 queries | prisma/ | Multiple queries | Select + batch, 2h |
| No memoization | app/ide/page.tsx | 40% wasted CPU | useMemo, 2h |
| O(n²) Evolution | lib/evolution-engine.ts | Slow scanning | Cache patterns, 1h |

---

## IMPLEMENTATION ORDER

```
Day 1: BullMQ (morning) + File Hashing (afternoon)
Day 2: Repair Cycles (morning) + WebSocket (afternoon)
Day 3: Frontend + Testing
Day 4: Secondary fixes
Day 5: Validation & deployment
```

---

## ONE-LINE COMMANDS

```bash
# Check current metrics
curl http://localhost:3000/api/health

# Run load test
npm run test:load

# Benchmark before changes
npm run benchmark:all

# Run specific benchmark
npm run benchmark:file-hashing
npm run benchmark:repair-cycle
npm run benchmark:queue-throughput

# Monitor worker
npm run monitor:workers
npm run monitor:queue

# Check WebSocket stats
curl http://localhost:3000/api/debug/websocket-stats
```

---

## REDIS SETUP (5 MINUTES)

```bash
# Option 1: Docker (easiest)
docker run -d -p 6379:6379 redis:7

# Option 2: Homebrew
brew install redis && redis-server

# Option 3: Cloud (Upstash)
# https://upstash.com/
# Set REDIS_URL=redis://user:pass@host:port
```

---

## ENV VARIABLES NEEDED

```bash
# Required
REDIS_HOST=localhost
REDIS_PORT=6379

# Optional but recommended
WORKER_CONCURRENCY=3
REPAIR_MAX_CYCLES=5
REPAIR_MAX_TIME_MS=300000
REPAIR_CONFIDENCE_THRESHOLD=60
```

---

## KEY METRICS TO WATCH

```
Before Fix          After Fix         Status
─────────────────────────────────────────────
10 jobs/sec  →      100+ jobs/sec    ✓ 10x
12 min error →      2 min error      ✓ 6x
500ms hash   →      <100ms hash      ✓ 5x
60 polls/min →      0 polls/min      ✓ 100%
30-40% CPU  →       <5% CPU          ✓ 8x
2-3GB mem   →       500MB mem        ✓ 4-6x
```

---

## TESTING CHECKLIST

```
✓ Unit tests pass
✓ Load test: 1000 jobs queued correctly
✓ Job throughput: >100 jobs/sec
✓ Repair time: <2 min for syntax error
✓ WebSocket: 0% zombies after 1h
✓ Frontend: 0 HTTP polling requests
✓ Memory: <500MB for 1000 jobs
✓ Browser CPU: <5% idle
```

---

## DEPLOYMENT CHECKLIST

```
Pre-deployment:
  ☐ All tests passing
  ☐ Benchmarks show improvement
  ☐ Redis running and accessible
  ☐ Environment variables set
  ☐ Metrics endpoint working

Deployment:
  ☐ Deploy to staging
  ☐ Monitor for 1 hour
  ☐ Run load test on staging
  ☐ Check all alerts are quiet
  ☐ Deploy to production

Post-deployment:
  ☐ Monitor metrics dashboard
  ☐ Check job queue depth
  ☐ Monitor memory growth
  ☐ Verify WebSocket connections
  ☐ Test user workflows
```

---

## COMMON ISSUES & SOLUTIONS

### "Redis connection refused"
```bash
# Check if Redis is running
redis-cli ping

# Start Redis if not running
docker run -d -p 6379:6379 redis:7
# or
redis-server
```

### "Jobs not processing"
```bash
# Check worker is running
npm run monitor:workers

# Check queue has jobs
curl http://localhost:3000/api/health

# Restart workers
killall node
npm start
```

### "High memory usage"
```bash
# This is expected during transition
# After all fixes: should be <500MB per 1000 jobs

# Check for zombies
curl http://localhost:3000/api/debug/websocket-stats

# Restart if needed
npm run clean
npm start
```

### "Repair cycles still slow"
```bash
# Verify confidence threshold is set
echo $REPAIR_CONFIDENCE_THRESHOLD

# Check error classification
npm run test:error-classification

# May need to regenerate app instead of repair
```

---

## PERFORMANCE REGRESSION TEST

Run weekly to ensure no regressions:

```bash
#!/bin/bash
npm run benchmark:all > benchmarks-$(date +%Y%m%d).json
npm run test:load > load-test-$(date +%Y%m%d).json
npm run test:websocket-load > ws-load-$(date +%Y%m%d).json

# Compare against baseline
# If any metric regresses: investigate
```

---

## FILES MODIFIED

Count of changes per file:

```
lib/job-queue-enhanced.ts          : ~400 lines changed (60%)
lib/agent-engine-enhanced.ts       : ~300 lines changed (40%)
lib/websocket-stream.ts            : ~200 lines changed (100%)
app/ide/page.tsx                   : ~200 lines changed (40%)
workers/bullmq-worker.mjs          : ~50 lines changed (10%)
prisma/schema.prisma               : No changes (queries only)
```

**Total changes:** ~1150 lines across 5 files

---

## ROLLBACK PLAN

If critical issue found:

```bash
# Revert last commit
git revert HEAD

# Or specific file
git checkout HEAD~1 -- lib/job-queue-enhanced.ts

# Restart with old queue
npm start

# Investigate what went wrong
# Then fix and redeploy
```

---

## SUPPORT CONTACTS

- Performance issues: Check PERFORMANCE_AUDIT_REPORT.md
- Implementation help: See PERFORMANCE_AUDIT_IMPLEMENTATION.md
- Metrics/monitoring: See PERFORMANCE_AUDIT_METRICS.md
- Quick start: This document

---

## SUCCESS CRITERIA

Project is successful when:

✅ Job queue: 100+ jobs/sec  
✅ Repair cycles: <2 min for unrecoverable  
✅ WebSocket: 0% zombie connections  
✅ Frontend: No HTTP polling  
✅ Memory: <500MB per 1000 jobs  
✅ All tests passing  
✅ Production stable for 7 days  

---

**Last Updated:** May 26, 2026  
**Format:** Print-friendly quick reference  
**Keep this:** On your desk during implementation

