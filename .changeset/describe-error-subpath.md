---
"@workflow/core": patch
---

Expose `describeError` and a new data-driven `describeRunError` helper under
the `@workflow/core/describe-error` subpath. `describeRunError` takes
`{ errorCode, errorName }` fields (as they appear on persisted failure
events) and returns the same `{ attribution, hint }` description, so CLI
and web observability renderers can derive user-vs-SDK framing without
needing the original `Error` instance.
