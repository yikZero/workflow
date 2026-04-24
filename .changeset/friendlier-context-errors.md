---
"@workflow/core": patch
"@workflow/errors": patch
---

Add structured context-violation error classes (`NotInWorkflowContextError`, `NotInStepContextError`, `NotInWorkflowOrStepContextError`, `UnavailableInWorkflowContextError`) with docs links and terminal-friendly framing, plus `Ansi` rendering helpers on `@workflow/errors`. Applied to all twelve user-facing context-violation sites in `@workflow/core`.
