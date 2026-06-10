# DealPilot 30

Build preflight CRM for sales managers where users create clients, move deals, assign tasks, and save activity history. unique architecture variant 30

This is an isolated crm application. It does not depend on a shared app shell.

## Classification
- App type: SaaS dashboard
- Real users: yes
- Real actions: yes
- Real data: yes
- Real state changes: yes

## Runtime behavior
- Component: PipelineCommandCenter
- State engine: lib/pipeline-engine.ts
- Primary API: /api/clients
- Interaction: move deal

## Routes
- /: DealPilot 30 command center
- /crm-30-queue: Variant 30 work queue and approvals
- /crm-30-rules: Variant 30 automation rules
- /crm-30-insights: Variant 30 performance insights

## Schema
- CrmRuntime30: crm-30Name, crm-30Owner, crm-30State, crm-30Score
- CrmEvent30: crm-30RecordId, crm-30Action, crm-30Actor, crm-30Result
- CrmAudit30: crm-30EventId, crm-30Reviewer, crm-30Decision, crm-30CreatedAt

## Relationships
- CrmRuntime30 one-to-many CrmEvent30 via crm-30RecordId
- CrmEvent30 one-to-many CrmAudit30 via crm-30EventId

## Functional interactions
- Create variant 30 event: Adds event to DealPilot 30 runtime queue
- Advance variant 30 state: Moves Queued -> Active -> Reviewed -> Done
- Remove variant 30 audit: Removes audit and dependent runtime rows

## Architecture maps
- architecture/database-schema.json: relational model graph
- architecture/api-map.json: action-to-backend endpoint map
- architecture/state-graph.json: state transition graph
- architecture/event-system.json: event trigger map
- architecture/job-system.json: async/background job policy
- architecture/execution-binding.json: UI action to API to data to state to UI proof
- architecture/runtime-factory.json: build, boot, interaction, preview, heal, and deploy gates
