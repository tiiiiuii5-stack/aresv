# DealPilot

Build CRM with clients deals tasks real button execution API database state refresh 1780203145722.

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
- /: Pipeline overview and daily revenue actions
- /clients: Account list, owners, and renewal risk
- /pipeline: Drag-style deal stage board
- /analytics: Win-rate and SLA trend reporting

## Schema
- Client: name, owner, health, renewalDate, notes
- Deal: clientId, stage, value, probability, nextStep
- Task: dealId, title, status, createdAt, completedAt

## Relationships
- Client one-to-many Deal via clientId
- Deal one-to-many Task via dealId

## Functional interactions
- Create deal: Adds a deal to the first pipeline stage
- Advance stage: Moves Lead -> In Progress -> Review -> Done
- Delete task: Removes completed task from the deal

## Architecture maps
- architecture/database-schema.json: relational model graph
- architecture/api-map.json: action-to-backend endpoint map
- architecture/state-graph.json: state transition graph
- architecture/event-system.json: event trigger map
- architecture/job-system.json: async/background job policy
- architecture/execution-binding.json: UI action to API to data to state to UI proof
