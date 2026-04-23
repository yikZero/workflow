---
'@workflow/core': patch
'@workflow/errors': patch
---

Add `SerializationError` (with optional `hint` and docs link) and apply it to
user-facing serialization boundaries: stream locking, unregistered classes,
missing `WORKFLOW_DESERIALIZE`, step-function / workflow-function misuse, and
dehydrate/hydrate failures for workflow args, step args, and return values.
Bare `throw new Error(…)` internal invariants now throw `WorkflowRuntimeError`
for consistent classification.
