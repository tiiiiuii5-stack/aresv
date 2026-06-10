# AI Music Growth Platform Specs

## Product

An AI-powered music promotion SaaS for independent artists. The app helps artists upload songs, generate viral campaign strategies, create short-form content assets, schedule distribution, track growth, and build fan communities.

## Core Surfaces

- Artist onboarding and brand profile
- Song upload and release setup
- AI viral campaign generator
- AI content studio for captions, hooks, visualizer ideas, lyric-video plans, cover concepts, and post variants
- Trend hunter for sounds, memes, hashtags, creator formats, and rising genres
- Social publishing calendar for TikTok, Instagram Reels, YouTube Shorts, Spotify, Apple Music, SoundCloud, and emerging platforms
- Music analytics dashboard with virality score, growth heatmaps, saves, shares, fan conversion, and platform performance
- Fan community with missions, exclusive drops, tipping, subscriptions, and loyalty rewards
- AI manager assistant with daily action plans
- Creator/influencer marketplace and outreach planner
- Stripe subscription plans and agency dashboard

## Architecture

- Next.js App Router + TypeScript + Tailwind
- PostgreSQL schema for artists, tracks, campaigns, content assets, posts, fans, missions, subscriptions, analytics events, integrations, and creator marketplace records
- Cloudinary-ready media storage adapter
- Stripe-ready billing adapter
- Safe mock adapters for Spotify, Apple Music, YouTube, SoundCloud, TikTok, and Instagram until real OAuth/API keys are supplied
- Queue-backed AI/media jobs for campaign generation, content planning, trend scans, post scheduling, analytics refresh, and outreach tasks
- Redis-ready trend cache and campaign job state
- AI manager chat API with structured campaign outputs

## Required API Routes

- `POST /api/tracks/upload`
- `POST /api/campaigns/generate`
- `GET /api/campaigns`
- `POST /api/content/generate`
- `GET /api/trends`
- `POST /api/schedule`
- `GET /api/analytics`
- `POST /api/fans/missions`
- `POST /api/assistant`
- `POST /api/billing/checkout`
- `GET /api/integrations`

## Database Entities

- `Artist`
- `Track`
- `Campaign`
- `CampaignIdea`
- `ContentAsset`
- `ScheduledPost`
- `TrendSignal`
- `Fan`
- `FanMission`
- `Subscription`
- `AnalyticsEvent`
- `PlatformIntegration`
- `CreatorProfile`
- `OutreachMessage`

## Design Direction

Dark cinematic interface with neon accents, audio-reactive visual language, mobile-first workflows, floating analytics cards, animated campaign timelines, viral-score meters, and an AI manager side panel.

## Quality Gates

- Upload flow has validation and safe file metadata handling
- Campaign generation returns structured hooks, captions, hashtags, video ideas, challenges, memes, influencer targets, and rollout steps
- External platform integrations are represented by typed adapters with environment placeholders
- Dashboard is useful on mobile and desktop
- Billing, auth, analytics, onboarding, and settings exist
- Generated app builds successfully
