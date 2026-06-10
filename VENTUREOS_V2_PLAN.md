# VentureOS v2 Product Plan

## Objective

VentureOS v2 is a self-improving Local AI App Builder that generates deployable SaaS products from plain-language startup ideas. It runs local-first with Ollama/custom providers, supports cloud AI fallback, validates generated code, and launches previews with a clearer repair loop.

## Architecture

- Next.js App Router command center for the product workspace.
- Route handlers for generation, chat, previews, billing, auth, admin, analytics, and provider connections.
- Prisma/Postgres for users, subscriptions, usage, billing events, projects, and encrypted AI provider connections.
- Local preview runtime for generated apps with polyglot service detection for Next.js, FastAPI, Go, and Rust.
- AI gateway layer that prefers a user's active provider and falls back to local Ollama/system scaffold behavior.

## Quality Loop

- Streaming generation events explain planning, generation, validation, repair, preview, and deploy stages.
- Generated projects are scored in the UI for deployability, product completeness, polyglot depth, monetization, and code review readiness.
- Human-suggested fixes are captured as visible next steps beside generated files.
- The platform stores successful architectures and failure patterns in memory for future generations.

## Standard Generated SaaS Requirements

Every generated SaaS should include auth, Stripe billing, dashboard, admin, analytics, onboarding, SEO metadata, deployment config, and a clear README. Polyglot requests should add FastAPI, Go, and Rust service examples with local run instructions.
