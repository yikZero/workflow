---
"@workflow/world-local": patch
---

Atomically dedupe `step_created` and `wait_created` events with the same `correlationId`. Concurrent invocations producing identical correlationIds (e.g. the snapshot runtime's deterministic ULIDs across replays) now consistently surface as `EntityConflictError` instead of allowing both writers through and persisting duplicate events.
