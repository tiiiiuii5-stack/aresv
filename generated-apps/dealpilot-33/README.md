# DealPilot 33

Build foreground worker CRM for sales managers where users create clients, move deals, assign tasks, and save activity history. unique architecture variant 33

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
- /: DealPilot 33 command center
- /crm-33-queue: Variant 33 work queue and approvals
- /crm-33-rules: Variant 33 automation rules
- /crm-33-insights: Variant 33 performance insights

## Schema
- CrmRuntime33: crm-33Name, crm-33Owner, crm-33State, crm-33Score
- CrmEvent33: crm-33RecordId, crm-33Action, crm-33Actor, crm-33Result
- CrmAudit33: crm-33EventId, crm-33Reviewer, crm-33Decision, crm-33CreatedAt

## Relationships
- CrmRuntime33 one-to-many CrmEvent33 via crm-33RecordId
- CrmEvent33 one-to-many CrmAudit33 via crm-33EventId

## Functional interactions
- Create variant 33 event: Adds event to DealPilot 33 runtime queue
- Advance variant 33 state: Moves Queued -> Active -> Reviewed -> Done
- Remove variant 33 audit: Removes audit and dependent runtime rows

## Architecture maps
- architecture/database-schema.json: relational model graph
- architecture/api-map.json: action-to-backend endpoint map
- architecture/state-graph.json: state transition graph
- architecture/event-system.json: event trigger map
- architecture/job-system.json: async/background job policy
- architecture/execution-binding.json: UI action to API to data to state to UI proof
- architecture/runtime-factory.json: build, boot, interaction, preview, heal, and deploy gates
