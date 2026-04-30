---
"@workflow/world-vercel": patch
---

Add snapshot storage endpoints (PUT/GET/DELETE `/v2/runs/:runId/snapshot`) for the new opt-in snapshot runtime in `@workflow/core`. Also enforces atomic per-(run, correlation) uniqueness for `step_created` / `hook_created` / `wait_created` events to dedupe concurrent invocations.
