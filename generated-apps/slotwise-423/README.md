# SlotWise 423

Build a project Gantt planning app for project managers, contributors, and executives. Real users: project manager, contributor, executive. Real actions: create tasks, define dependency graph, calculate dates, render Gantt timeline, drag tasks to reschedule, update dependent milestones, and export plan. Real data: users, projects, tasks, dependencies, milestones, schedule changes. Real state changes: dependency edits recalculate schedule, dragging changes task dates, milestone status persists, refresh keeps saved state. unique architecture variant 423

This is an isolated booking application. It does not depend on a shared app shell.

## Classification
- App type: internal tool
- Real users: yes
- Real actions: yes
- Real data: yes
- Real state changes: yes

## Runtime behavior
- Component: AvailabilityCalendar
- State engine: lib/availability-engine.ts
- Primary API: /api/bookings
- Interaction: book slot

## Routes
- /: SlotWise 423 command center
- /booking-423-queue: Variant 423 work queue and approvals
- /booking-423-rules: Variant 423 automation rules
- /booking-423-insights: Variant 423 performance insights

## Schema
- BookingRuntime423: booking-423Name, booking-423Owner, booking-423State, booking-423Score
- BookingEvent423: booking-423RecordId, booking-423Action, booking-423Actor, booking-423Result
- BookingAudit423: booking-423EventId, booking-423Reviewer, booking-423Decision, booking-423CreatedAt

## Relationships
- BookingRuntime423 one-to-many BookingEvent423 via booking-423RecordId
- BookingEvent423 one-to-many BookingAudit423 via booking-423EventId

## Functional interactions
- Create variant 423 event: Adds event to SlotWise 423 runtime queue
- Advance variant 423 state: Moves Queued -> Active -> Reviewed -> Done
- Remove variant 423 audit: Removes audit and dependent runtime rows

## Architecture maps
- architecture/database-schema.json: relational model graph
- architecture/api-map.json: action-to-backend endpoint map
- architecture/state-graph.json: state transition graph
- architecture/event-system.json: event trigger map
- architecture/job-system.json: async/background job policy
- architecture/execution-binding.json: UI action to API to data to state to UI proof
- architecture/runtime-factory.json: build, boot, interaction, preview, heal, and deploy gates
