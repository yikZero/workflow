---
"@workflow/world-vercel": patch
---

Fix snapshot save failures under network turbulence on Vercel. The previous implementation used `fetch() + RetryAgent` for `world.snapshots.save`, but `fetch()` wraps Buffer/Uint8Array bodies in a one-shot `ReadableStream` — so when the `RetryAgent` retries (on 5xx / network errors), the second attempt sends 0 bytes and undici throws `UND_ERR_REQ_CONTENT_LENGTH_MISMATCH`. With 5–15 MB snapshot bodies the bug fired constantly under load: a single failed save caused the workflow handler to return 500, the queue retried it forever (we observed `attempt: 19` in production logs), and the workflow run was effectively wedged. Switch to `undici.request()`, the lower-level API that hands the Buffer to the connection layer directly so retries can replay the same body. Adds a regression test that reproduces the exact failure (verified to fail without the fix and pass with it).
