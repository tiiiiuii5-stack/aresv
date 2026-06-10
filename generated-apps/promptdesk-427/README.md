# PromptDesk 427

Build a booking calendar for clinic admins, providers, and patients. Real users: clinic admin, provider, patient. Real actions: create availability slots, book appointments, generate ICS invites, sync Google Calendar, parse recurring availability rules, cancel appointments. Real data: users, providers, slots, appointments, recurring rules, calendar sync events. Real state changes: booking reduces availability, cancellation restores slot, sync marks provider event id, refresh keeps saved state. unique architecture variant 427

This is an isolated ai-content application. It does not depend on a shared app shell.

## Classification
- App type: AI tool
- Real users: yes
- Real actions: yes
- Real data: yes
- Real state changes: yes

## Runtime behavior
- Component: ContentStudio
- State engine: lib/content-engine.ts
- Primary API: /api/drafts
- Interaction: create brief

## Routes
- /: PromptDesk 427 command center
- /ai-content-427-queue: Variant 427 work queue and approvals
- /ai-content-427-rules: Variant 427 automation rules
- /ai-content-427-insights: Variant 427 performance insights

## Schema
- AiContentRuntime427: ai-content-427Name, ai-content-427Owner, ai-content-427State, ai-content-427Score
- AiContentEvent427: ai-content-427RecordId, ai-content-427Action, ai-content-427Actor, ai-content-427Result
- AiContentAudit427: ai-content-427EventId, ai-content-427Reviewer, ai-content-427Decision, ai-content-427CreatedAt

## Relationships
- AiContentRuntime427 one-to-many AiContentEvent427 via ai-content-427RecordId
- AiContentEvent427 one-to-many AiContentAudit427 via ai-content-427EventId

## Functional interactions
- Create variant 427 event: Adds event to PromptDesk 427 runtime queue
- Advance variant 427 state: Moves Queued -> Active -> Reviewed -> Done
- Remove variant 427 audit: Removes audit and dependent runtime rows

## Architecture maps
- architecture/database-schema.json: relational model graph
- architecture/api-map.json: action-to-backend endpoint map
- architecture/state-graph.json: state transition graph
- architecture/event-system.json: event trigger map
- architecture/job-system.json: async/background job policy
- architecture/execution-binding.json: UI action to API to data to state to UI proof
- architecture/runtime-factory.json: build, boot, interaction, preview, heal, and deploy gates
