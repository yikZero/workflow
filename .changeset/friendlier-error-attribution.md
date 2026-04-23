---
'@workflow/core': patch
---

Add presentation-only `describeError` helper that computes user vs SDK error
attribution from existing error classes and `RUN_ERROR_CODES`. Terminal logs
for step failures, max-delivery exhaustion, run failures, and fatal workflow
setup errors now include `errorAttribution` metadata and class-aware hints
for well-known error types (`SerializationError`, context-violation errors,
`WorkflowRuntimeError`, replay timeouts, max-delivery exhaustion). No event
data or persisted error classification is affected.
