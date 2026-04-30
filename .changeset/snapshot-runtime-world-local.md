---
"@workflow/world-local": minor
---

Add filesystem-backed snapshot storage (`snapshots.save` / `load` / `delete`) for the new snapshot runtime in `@workflow/core`. Also fixes a race in `events.create()` where concurrent `step_created` / `wait_created` writes with the same `correlationId` would both succeed.
