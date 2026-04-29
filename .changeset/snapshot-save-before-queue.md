---
"@workflow/core": patch
---

Snapshot runtime: re-establish `world.snapshots.save` as a barrier before any step is queued. Previously the save was pipelined with step queueing for additional speedup, but that opened a window where a fast-completing step could re-invoke the workflow handler before the new snapshot was persisted, leading to the handler loading a stale (or missing) snapshot whose coroutine state didn't match the latest events. The per-pending-op `events.create` + `queueMessage` calls remain parallelized via `Promise.all`, which preserves most of the wall-clock reduction.
