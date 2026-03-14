---
'@workflow/core': patch
'workflow': patch
---

Re-fetch event log on `wait_completed` 409 conflict to ensure correct event ordering
