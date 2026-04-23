---
'@workflow/core': patch
---

Cosmetic consistency pass on remaining `throw new Error(...)` call sites.
Internal invariants (missing `startedAt`, VM `crypto.subtle.generateKey`,
closure-vars outside step context, `ENOTSUP`) now throw `WorkflowRuntimeError`
so they are attributed to the SDK by `describeError`. `defineHook().resume()`
now formats schema validation failures as a readable list instead of a raw
JSON dump.
