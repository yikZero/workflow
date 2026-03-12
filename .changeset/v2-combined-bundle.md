---
'@workflow/core': patch
'@workflow/builders': patch
'@workflow/next': patch
'@workflow/world': patch
'workflow': patch
---

V2 combined bundle: merge flow and step routes into a single combined handler that executes steps inline when possible, reducing function invocations and queue overhead.
