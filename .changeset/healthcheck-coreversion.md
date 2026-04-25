---
"@workflow/core": patch
"workflow": patch
---

Surface `workflowCoreVersion` from the responding deployment in `healthCheck()` results. The field was already advertised on the wire by `handleHealthCheckMessage` but dropped on the read side. Useful for callers that need to derive capability metadata about a target deployment before sending it work — e.g. `getRunCapabilities()`-style version-gated decisions.
