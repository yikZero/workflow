---
"@workflow/core": patch
---

Stop counting inline step execution time toward the workflow replay timeout. The v5 combined workflow+step handler was wrapping inline step bodies in the 240s `REPLAY_TIMEOUT_MS` guard, causing legitimately long steps (e.g. model inference, long sleeps, long external API calls) to fail with `REPLAY_TIMEOUT` after 4 attempts. The replay budget now only covers replay/workflow-VM time between step boundaries, restoring v4 long-step semantics. Adds a `WORKFLOW_REPLAY_TIMEOUT_MS` env var override (clamped to 30s–780s).
