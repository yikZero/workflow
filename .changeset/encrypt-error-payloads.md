---
"@workflow/core": patch
"@workflow/world-vercel": minor
---

Encrypt error payloads (message, stack, errorCode) in failure events.

`step_failed`, `step_retrying`, and `run_failed` events now encrypt error data with the same per-run AES-256-GCM key used for inputs, outputs, and step results. `errorCode` is bundled inside the encrypted error blob rather than stored as a separate plaintext field.

**`@workflow/world-vercel`**: `deserializeError` is now `async` to handle the new encrypted `Uint8Array` format returned by the server. Update any direct callers to `await` the result.
