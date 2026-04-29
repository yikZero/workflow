---
"@workflow/core": patch
---

Skip the `world.snapshots.load` round-trip on the very first workflow handler invocation. When the events preloaded by `events.create('run_started')` contain only `run_created` and `run_started`, the suspension handler has not yet completed a save cycle and no snapshot can exist in storage — so the load would respond 404. Detected by the new exported `canSkipSnapshotLoad` helper, which is verified by 8 unit tests. Saves a network round-trip per first invocation and reduces 404 noise in workflow-server logs.
