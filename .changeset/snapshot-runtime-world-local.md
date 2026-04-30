---
"@workflow/world-local": patch
---

Add filesystem-backed snapshot storage for the new opt-in snapshot runtime in `@workflow/core`. Also enforces atomic per-(run, correlation) uniqueness for `step_created` and `wait_created` events to dedupe concurrent invocations.
