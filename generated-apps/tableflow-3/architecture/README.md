# TableFlow Architecture

## Database schema
See `database-schema.json` for models and real relationships.

## API map
See `api-map.json`. Every listed action is bound to a backend endpoint and must persist state.

## State graph
See `state-graph.json`. Transitions define what changes what.

## Event system
See `event-system.json`. Events describe trigger, payload, and side effects.

## Job system
See `job-system.json`. Async work is queued when the action is long-running or externally dependent.

## Execution binding
See `execution-binding.json`. Every button must complete: UI action -> API route -> database change -> state update -> UI refresh.

## Runtime factory
See `runtime-factory.json`. Preview and deployment are blocked unless build, runtime, interaction, and fake-UI checks pass.
