---
"@workflow/core": minor
---

Refactor the monolithic `serialization.ts` into a modular `serialization/` directory with focused files for types, format prefix, encryption, codec, and per-mode (workflow/step/client) serialize/deserialize entry points. The legacy `dehydrate*`/`hydrate*` functions now delegate to the modular pipeline.

- Return types of `getExternalReducers`, `getWorkflowReducers`, `getExternalRevivers`, and `getWorkflowRevivers` narrowed from `Reducers`/`Revivers` to `Partial<Reducers>`/`Partial<Revivers>`. This reflects reality (some keys are mode-specific) but callers that indexed into specific keys without a guard may need to add non-null assertions or optional chaining
- Adds 138 unit tests covering the modular serialization pipeline
