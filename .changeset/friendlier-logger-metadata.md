---
"@workflow/core": patch
---

Improve workflow runtime error logging:

- Structured logger now supports `.child()` and `.forRun(runId, workflowName)` to attach stable run/step context to every log line without repetition.
- Standardize console prefix to `[workflow-sdk]`.
- Include error stacks in fatal and user-code errors; use the stack as the primary log message so it surfaces in flattened log drains.
- Clarify replay-timeout messages (warn while retrying vs. error when giving up), and surface the underlying error when we can't mark a timed-out run as failed.
- Add comments to silent catches that swallow expected idempotency conflicts.
- Drop the `[Workflows] "<runId>" - ` prefix from `buildWorkflowSuspensionMessage` — the structured logger attaches run context now.
