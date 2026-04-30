---
"@workflow/world-postgres": patch
---

Add a `workflow_snapshots` table for the new opt-in snapshot runtime in `@workflow/core`, plus a unique partial index on `workflow_events(run_id, correlation_id, type)` for entity-creating events to dedupe concurrent invocations.
