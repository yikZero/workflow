---
"@workflow/core": patch
---

Refactor the monolithic `serialization.ts` into a modular `serialization/` directory with focused files for types, format prefix, encryption, codec, and per-mode (workflow/step/client) serialize/deserialize entry points. The legacy `dehydrate*`/`hydrate*` functions now delegate to the modular pipeline. No runtime behavior change; all previously-exported names remain exported from the same entry point. Also adds 138 unit tests covering the modular pipeline.
