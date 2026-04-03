---
"@workflow/core": patch
---

Refactor: Replace duplicate serialization code in `serialization.ts` with imports from modular `serialization/` modules. Removes ~450 lines of duplicated format prefix, reducer/reviver, and encryption helper code. Adds 138 unit tests for the modular serialization pipeline.
