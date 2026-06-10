# MetricOS

Build an analytics app with metrics, alerts, cohorts, state transitions, backend events, and async alert jobs 1780202672284.

This is an isolated analytics application. It does not depend on a shared app shell.

## Classification
- App type: SaaS dashboard
- Real users: yes
- Real actions: yes
- Real data: yes
- Real state changes: yes

## Runtime behavior
- Component: MetricsWarRoom
- State engine: lib/metric-engine.ts
- Primary API: /api/metrics
- Interaction: create alert

## Routes
- /: Executive KPI summary
- /funnels: Activation and conversion analysis
- /retention: Cohorts and churn risk
- /alerts: Operational warnings

## Schema
- Metric: name, value, delta, segment, period
- Alert: metricId, severity, message, owner
- Cohort: metricId, name, period, retention

## Relationships
- Metric one-to-many Alert via metricId
- Metric one-to-many Cohort via metricId

## Functional interactions
- Create alert: Adds metric alert to owner queue
- Resolve alert: Moves Open -> Investigating -> Resolved
- Delete cohort: Removes stale cohort analysis

## Architecture maps
- architecture/database-schema.json: relational model graph
- architecture/api-map.json: action-to-backend endpoint map
- architecture/state-graph.json: state transition graph
- architecture/event-system.json: event trigger map
- architecture/job-system.json: async/background job policy
