---
"@workflow/core": patch
---

Add an opt-in QuickJS WASM-based snapshot runtime that suspends and resumes workflows by serializing the VM heap. Enable via `WORKFLOW_RUNTIME=snapshot`; the replay runtime remains the default.
