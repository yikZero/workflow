---
"@workflow/world-vercel": patch
"@workflow/world-postgres": patch
"@workflow/world-local": patch
---

Stop double-compressing snapshots in the world layer. Compression now happens in `@workflow/core`'s snapshot entrypoint as part of the `compress → encrypt → save` pipeline (see the corresponding `@workflow/core` changeset). The world layers transport opaque bytes through, and only need to handle backward compatibility for blobs that were stored before this change. World-vercel still gunzips on load when the response carries the legacy `X-Snapshot-Content-Encoding: gzip` header. World-local still gunzips when the metadata `dataFile` ends in `.bin.gz`. World-postgres no longer compresses (its snapshot table is freshly created per CI run and contains only ephemeral test data, so no backward compat layer is needed).
