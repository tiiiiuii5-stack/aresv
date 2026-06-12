# 🚀 Vercel Deployment Setup Guide

## Step 1: Connect Repository to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Select "Import Git Repository"
3. Enter: `https://github.com/tiiiiuii5-stack/aresv.git`
4. Click "Import"
5. Choose "Next.js" framework (should auto-detect)

---

## Step 2: Set Environment Variables in Vercel

**DO NOT commit secrets to GitHub.** Add them in Vercel Dashboard instead.

### 2A: Required Variables (ALL environments)

Go to: **Settings → Environment Variables**

| Variable | Value | Scope |
|----------|-------|-------|
| `DATABASE_URL` | PostgreSQL connection string | Production, Preview, Development |
| `REDIS_URL` | Redis connection string | Production, Preview, Development |
| `SESSION_SECRET` | Random 32+ char string | Production, Preview, Development |
| `ENCRYPTION_KEY` | Random 32-char hex string | Production, Preview, Development |
| `NEXT_PUBLIC_APP_URL` | `https://ventureos-full-fixed.vercel.app` | Production, Preview, Development |

### 2B: Production-Only Variables

Add these with scope = **"Production"**

| Variable | Value | How to Get |
|----------|-------|-----------|
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | See Azure setup below | Azure Portal → Application Insights → Connection String |
| `STRIPE_SECRET_KEY` | Your Stripe API key | Stripe Dashboard → API Keys → Secret Key |
| `GEMINI_API_KEY` | Your Google Gemini key | [AI Studio](https://aistudio.google.com/app/apikeys) |

### 2C: Optional (Recommended for Production)

Add with scope = **"Production"**

```
GEMINI_MODEL = gemini-2.5-flash
RATE_LIMIT_MAX = 120
RATE_LIMIT_WINDOW_MS = 60000
```

---

## Step 3: Set Up Azure Application Insights

### Option A: Using Azure CLI (Fastest)

```bash
# Create Application Insights resource
az monitor app-insights component create \
  --app ventureos-insights \
  --resource-group <your-resource-group> \
  --location eastus

# Get Connection String
az monitor app-insights component show \
  --app ventureos-insights \
  --resource-group <your-resource-group> \
  --query connectionString -o tsv
```

Copy the connection string → Paste into Vercel as `APPLICATIONINSIGHTS_CONNECTION_STRING`

### Option B: Using Azure Portal (5 min)

1. Go to [portal.azure.com](https://portal.azure.com)
2. Click "Create a resource"
3. Search: "Application Insights"
4. Click "Create"
5. Fill in:
   - **Name**: `ventureos-insights`
   - **Resource Group**: (same as your other resources)
   - **Location**: East US
6. Click "Review + create" → "Create"
7. Go to resource → "Properties"
8. Copy **Connection String** (starts with `InstrumentationKey=...`)
9. Add to Vercel as `APPLICATIONINSIGHTS_CONNECTION_STRING`

---

## Step 4: Set Up Stripe (For Payments)

1. Go to [stripe.com](https://stripe.com) → Sign in/Create account
2. Go to **Developers → API Keys**
3. Copy **Secret Key** (starts with `sk_live_...`)
4. Add to Vercel as `STRIPE_SECRET_KEY` (Production scope)

---

## Step 5: Set Up Google Gemini API (For Code Generation)

1. Go to [aistudio.google.com/app/apikeys](https://aistudio.google.com/app/apikeys)
2. Click "Create API key"
3. Copy the API key
4. Add to Vercel as `GEMINI_API_KEY` (Production scope)

---

## Step 6: Configure Build Settings (Optional)

In Vercel Dashboard:
- **Build Command**: `npm run build`
- **Output Directory**: `.next`
- **Install Command**: `npm install --legacy-peer-deps`

These usually auto-detect, but verify if build fails.

---

## Step 7: Deploy!

### Option A: Automatic (Recommended)
1. Push to `main` branch → GitHub Actions + Vercel auto-deploy
2. Watch: https://github.com/tiiiiuii5-stack/aresv/actions

### Option B: Manual
1. Vercel Dashboard → Click "Deploy" button
2. Wait for build to complete (3-5 min)
3. Visit deployment URL when ready

---

## Step 8: Verify Deployment

After deployment completes:

✅ **1. Check App Loads**
```
https://ventureos-full-fixed.vercel.app
```
Should see homepage with "Free Review" section

✅ **2. Check Health Endpoint**
```
https://ventureos-full-fixed.vercel.app/api/health
```
Should return JSON: `{ "status": "ok", ... }`

✅ **3. Check Monitoring**
1. Go to Azure Portal
2. Application Insights → ventureos-insights
3. "Live Metrics" should show incoming requests within 1-2 min

✅ **4. Check Logs in Vercel**
1. Vercel Dashboard → Deployment → Logs
2. Should see "✓ Build successful"
3. No errors in "Runtime Logs"

---

## Troubleshooting

### Build Fails: "tsc not found"
```bash
npm install --legacy-peer-deps
npm run type-check
```

### Build Fails: "Missing environment variable X"
Run verification locally:
```bash
npm run verify:env
```
Add missing variables to Vercel.

### Deployment timeout (>60 min)
- Vercel timeout: Usually 1 hour max
- Check if build is stuck in logs
- Try Vercel CLI locally: `vercel build`

### AppInsights not showing data
1. Wait 2-3 minutes (telemetry batches)
2. Verify connection string is set in Vercel
3. Check it was applied: Redeploy via Vercel
4. Look for errors in "Runtime Logs"

### Stripe webhook failures
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://ventureos-full-fixed.vercel.app/api/stripe/webhook`
3. Select events: `payment_intent.succeeded`, `invoice.payment_succeeded`

---

## Environment Variable Checklist

Before hitting "Deploy", verify in Vercel:

**Required (All Scopes)**:
- [ ] `DATABASE_URL` (PostgreSQL)
- [ ] `REDIS_URL` (Redis)
- [ ] `SESSION_SECRET` (Random string)
- [ ] `ENCRYPTION_KEY` (32-char hex)
- [ ] `NEXT_PUBLIC_APP_URL` (Your app URL)

**Production Only**:
- [ ] `APPLICATIONINSIGHTS_CONNECTION_STRING` (Azure)
- [ ] `STRIPE_SECRET_KEY` (Stripe)
- [ ] `GEMINI_API_KEY` (Google)

**Optional But Recommended**:
- [ ] `GEMINI_MODEL` (Set to `gemini-2.5-flash`)
- [ ] `RATE_LIMIT_MAX` (Set to `120`)

✅ All checked? Ready to deploy!

---

## Post-Deployment Steps

1. **Monitor for 24 hours**
   - Check Application Insights dashboard for errors
   - Monitor Stripe for failed payments
   - Check GitHub Actions workflow runs

2. **Set Up Alerting** (Optional)
   - Azure App Insights → Alerts → Create alert
   - Slack integration → Get notifications for errors

3. **Set Up Auto-Renewal** (For Production)
   - Stripe → Billing → Set up recurring charges if needed
   - Database backups → Enable automated backups

4. **Document Runbook**
   - How to rollback if something breaks
   - How to scale if traffic spikes
   - How to monitor error rates

---

## Quick Reference: Vercel Commands

```bash
# Test build locally before pushing
npm run build

# Verify environment variables
npm run verify:env

# Manually deploy (if not using auto-deploy)
vercel deploy --prod

# View logs
vercel logs
```

---

## Support

- **Vercel Docs**: https://vercel.com/docs
- **Azure AppInsights**: https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview
- **Stripe Integration**: https://stripe.com/docs/stripe-cli/install
- **GitHub Actions**: https://docs.github.com/en/actions

---

**Questions?** Check the deployment in real-time:
- GitHub Actions: https://github.com/tiiiiuii5-stack/aresv/actions
- Vercel Logs: https://vercel.com/dashboard
- Azure Portal: https://portal.azure.com
