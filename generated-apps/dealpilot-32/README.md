# DealPilot 32

Build isolated local test CRM for sales managers where users create clients, move deals, assign tasks, and save activity history. unique architecture variant 32

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
- /: DealPilot 32 command center
- /crm-32-queue: Variant 32 work queue and approvals
- /crm-32-rules: Variant 32 automation rules
- /crm-32-insights: Variant 32 performance insights

## Schema
- CrmRuntime32: crm-32Name, crm-32Owner, crm-32State, crm-32Score
- CrmEvent32: crm-32RecordId, crm-32Action, crm-32Actor, crm-32Result
- CrmAudit32: crm-32EventId, crm-32Reviewer, crm-32Decision, crm-32CreatedAt

## Relationships
- CrmRuntime32 one-to-many CrmEvent32 via crm-32RecordId
- CrmEvent32 one-to-many CrmAudit32 via crm-32EventId

## Functional interactions
- Create variant 32 event: Adds event to DealPilot 32 runtime queue
- Advance variant 32 state: Moves Queued -> Active -> Reviewed -> Done
- Remove variant 32 audit: Removes audit and dependent runtime rows

## Architecture maps
- architecture/database-schema.json: relational model graph
- architecture/api-map.json: action-to-backend endpoint map
- architecture/state-graph.json: state transition graph
- architecture/event-system.json: event trigger map
- architecture/job-system.json: async/background job policy
- architecture/execution-binding.json: UI action to API to data to state to UI proof
- architecture/runtime-factory.json: build, boot, interaction, preview, heal, and deploy gates
