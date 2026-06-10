# DealPilot

Build a CRM system for client pipelines, projects, tasks, revenue stages, and account follow-up.

This is an isolated crm application. It does not depend on a shared app shell.

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
