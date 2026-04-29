---
"@workflow/core": patch
---

Snapshot runtime: parallelize per-pending-op event creation + step queueing, run `snapshot.save` concurrently with the op dispatch, and drop the redundant `hooks.list` pre-check from the `hook_created` branch (now redundant with deterministic correlationIds and per-(runId, correlationId) uniqueness in the worlds). Significantly reduces wall-clock time per workflow round-trip on cloud worlds where each storage call is a network round-trip — measured ~2x slower than the replay runtime on Vercel before this change.
