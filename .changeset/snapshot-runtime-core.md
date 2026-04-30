---
"@workflow/core": minor
---

Add a new QuickJS WASM-based snapshot runtime that suspends and resumes workflows by serializing the VM heap. Now the default; the previous event-replay runtime remains available via `WORKFLOW_RUNTIME=replay`.
