---
"@workflow/world-vercel": patch
"@workflow/world-local": patch
---

Drop now-unnecessary backward-compatibility code from the snapshot world layers. The snapshot runtime is still pre-launch (only present on the `snapshot-runtime` feature branch), so no production blob has ever been written under the old SDK-side gzip scheme — the back-compat code was strictly for our own dev `.workflow-data/` directories and CI Vercel deployments, neither of which need to outlive a single feature-branch deploy.

`@workflow/world-vercel`: remove the `X-Snapshot-Content-Encoding: gzip` header round-trip and the `gunzipSync` import. Snapshots are transported opaquely (already compressed+encrypted by core).

`@workflow/world-local`: remove the `.bin.gz` filename / `dataFile` metadata mechanism, the `gunzipSync` import, and the `LocalSnapshotMetadataSchema` extension. Snapshots are stored as `{runId}.bin` opaque bytes alongside `{runId}.json` metadata (just `eventsCursor` + `createdAt`).
