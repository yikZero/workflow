---
"@workflow/world-postgres": patch
---

Add a unique partial index on `workflow_events(run_id, correlation_id, type)` for the entity-creating events (`step_created`, `hook_created`, `wait_created`) and translate the resulting unique-violation into `EntityConflictError`. This ensures concurrent invocations producing identical correlationIds (e.g. the snapshot runtime's deterministic ULIDs across replays) consistently dedupe at the storage layer instead of allowing duplicate event rows.
