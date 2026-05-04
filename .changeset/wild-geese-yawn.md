---
---

Skip `should rebuild on imported step dependency change` e2e test on Windows where Turbopack wedges with a "file not found" error for `@workflow/core/dist/runtime/start.js` during initial instrumentation compile. The dev server never self-heals within the test timeout and a retry doesn't reset the broken module-resolution cache. Test still runs on Linux and macOS.
