---
"@workflow/world-vercel": patch
---

Add `WORLD_SNAPSHOT_DIAG` checkpoint logs to `snapshots.save()` and `snapshots.load()` reporting actual on-the-wire byte counts (after gzip), per-stage durations (gzip / gunzip / HTTP round-trip), and compression ratio. Pairs with the core `SNAPSHOT_DIAG` checkpoints so a wedged run's full snapshot lifecycle is visible by `runId` in Vercel function logs without DEBUG. Also covers the 404 (no-snapshot) case so the core fast-path `skippedLoad: true` checkpoints can be cross-referenced.
