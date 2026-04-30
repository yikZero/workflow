---
"@workflow/world-vercel": minor
---

Add snapshot storage (PUT/GET/DELETE `/v2/runs/:runId/snapshot`) for the new snapshot runtime in `@workflow/core`. Switches the save path from `fetch()` to `undici.request()` so the `RetryAgent` can replay multi-MB snapshot bodies on transient errors.
