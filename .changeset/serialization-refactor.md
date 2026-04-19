---
"@workflow/core": minor
"workflow": minor
---

Refactor the monolithic `serialization.ts` into a modular `serialization/` directory with focused files for types, format prefix, encryption, codec, and per-mode (workflow/step/client) serialize/deserialize entry points. The legacy `dehydrate*`/`hydrate*` functions now delegate to the modular pipeline.

- New public sub-path exports: `@workflow/core/serialization/workflow` and `workflow/internal/serialization` for the future snapshot runtime
- Return types of `getExternalReducers`, `getWorkflowReducers`, `getExternalRevivers`, `getWorkflowRevivers`, and `getCommonRevivers` narrowed from `Reducers`/`Revivers` to `Partial<Reducers>`/`Partial<Revivers>`. This reflects reality (some keys are mode-specific) but callers that indexed into specific keys without a guard may need to add non-null assertions or optional chaining
- Adds 138 unit tests covering the modular serialization pipeline
