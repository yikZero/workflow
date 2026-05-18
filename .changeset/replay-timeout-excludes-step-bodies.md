---
"@workflow/core": patch
---

Exclude inline step execution from the workflow replay timeout. Long-running steps no longer hit `REPLAY_TIMEOUT` (fixes #2009). Adds `WORKFLOW_REPLAY_TIMEOUT_MS` env var override.
