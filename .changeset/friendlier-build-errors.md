---
"@workflow/errors": patch
"@workflow/builders": patch
---

Add `WorkflowBuildError` class (with optional `hint` for an actionable next
step) and apply it to user-facing build sites in `@workflow/builders`:
failed esbuild phases, unresolved built-in steps, and empty esbuild output
now throw `WorkflowBuildError` with a hint pointing at the fix. Runtime
invariants remain plain `Error`.
