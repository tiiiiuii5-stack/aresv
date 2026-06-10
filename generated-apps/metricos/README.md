# MetricOS

Build a SaaS analytics dashboard with metrics, alerts, cohorts, funnels, and retention workflows.

This is an isolated analytics application. It does not depend on a shared app shell.

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
