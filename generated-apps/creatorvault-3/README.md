# CreatorVault

Build a video streaming platform for creators, editors, and viewers. Real users: creator, video editor, subscriber. Real actions: upload video multipart, queue FFmpeg transcoding, generate HLS playlist, publish CDN playback URL, track processing status, and manage video library. Real data: users, videos, transcode jobs, renditions, playlists, subscriptions. Real state changes: upload creates asset, transcode updates status, publish exposes CDN URL, refresh keeps saved state.

This is an isolated creator application. It does not depend on a shared app shell.

## Classification
- App type: internal tool
- Real users: yes
- Real actions: yes
- Real data: yes
- Real state changes: yes

## Runtime behavior
- Component: CreatorRevenueHub
- State engine: lib/creator-engine.ts
- Primary API: /api/offers
- Interaction: launch offer

## Routes
- /: Revenue, subscribers, and paid offer status
- /offers: Paid products, tiers, and bundles
- /subscribers: Audience segments and retention risk
- /launches: Campaign calendar and drop readiness

## Schema
- Offer: title, price, tier, conversionRate, status
- Subscriber: email, tier, lifetimeValue, risk, joinedAt
- Purchase: offerId, subscriberId, amount, status

## Relationships
- Offer one-to-many Purchase via offerId
- Subscriber one-to-many Purchase via subscriberId

## Functional interactions
- Launch offer: Adds paid offer to launch board
- Convert subscriber: Moves Interested -> Purchased -> Retained
- Cancel subscriber: Marks subscriber inactive

## Architecture maps
- architecture/database-schema.json: relational model graph
- architecture/api-map.json: action-to-backend endpoint map
- architecture/state-graph.json: state transition graph
- architecture/event-system.json: event trigger map
- architecture/job-system.json: async/background job policy
- architecture/execution-binding.json: UI action to API to data to state to UI proof
- architecture/runtime-factory.json: build, boot, interaction, preview, heal, and deploy gates
