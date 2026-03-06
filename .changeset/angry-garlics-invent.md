---
"@workflow/world-postgres": patch
"@workflow/world-vercel": patch
"@workflow/world-local": patch
"@workflow/web-shared": patch
"@workflow/world": patch
"@workflow/cli": patch
"@workflow/web": patch
---

Require runId argument for `world.readFromStream` and `world.steps.get`. Replace `world.events.listByCorrelationId` with `world.events.get(eventId)`.

