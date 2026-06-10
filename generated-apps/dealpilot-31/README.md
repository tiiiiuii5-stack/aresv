# DealPilot 31

Build fixed worker preflight CRM for sales managers where users create clients, move deals, assign tasks, and save activity history. unique architecture variant 31

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
- /: DealPilot 31 command center
- /crm-31-queue: Variant 31 work queue and approvals
- /crm-31-rules: Variant 31 automation rules
- /crm-31-insights: Variant 31 performance insights

## Schema
- CrmRuntime31: crm-31Name, crm-31Owner, crm-31State, crm-31Score
- CrmEvent31: crm-31RecordId, crm-31Action, crm-31Actor, crm-31Result
- CrmAudit31: crm-31EventId, crm-31Reviewer, crm-31Decision, crm-31CreatedAt

## Relationships
- CrmRuntime31 one-to-many CrmEvent31 via crm-31RecordId
- CrmEvent31 one-to-many CrmAudit31 via crm-31EventId

## Functional interactions
- Create variant 31 event: Adds event to DealPilot 31 runtime queue
- Advance variant 31 state: Moves Queued -> Active -> Reviewed -> Done
- Remove variant 31 audit: Removes audit and dependent runtime rows

## Architecture maps
- architecture/database-schema.json: relational model graph
- architecture/api-map.json: action-to-backend endpoint map
- architecture/state-graph.json: state transition graph
- architecture/event-system.json: event trigger map
- architecture/job-system.json: async/background job policy
- architecture/execution-binding.json: UI action to API to data to state to UI proof
- architecture/runtime-factory.json: build, boot, interaction, preview, heal, and deploy gates
