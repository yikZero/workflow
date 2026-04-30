---
"@workflow/world-postgres": minor
---

Add a `workflow_snapshots` table and `snapshots.save` / `load` / `delete` storage for the new snapshot runtime in `@workflow/core`. Also fixes a race in `events.create()` where concurrent `step_created` / `hook_created` / `wait_created` writes with the same `correlationId` would persist duplicate event rows.
