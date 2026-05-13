---
"@workflow/core": minor
"workflow": minor
---

`start()` now delegates run ID generation to `world.createRunId(input)` when the world provides it, falling back to a monotonic ULID otherwise. Adds a new `runIdInput` option that is forwarded verbatim to `world.createRunId`; when `runIdInput.region` is a string, it is also threaded onto the queue options so the initial workflow message is routed to the matching region.
