---
"@workflow/world-vercel": patch
---

Handle ECONNRESET and other transient network errors in fetch calls by wrapping them as WorkflowAPIError with status 500, enabling automatic retry via withServerErrorRetry
