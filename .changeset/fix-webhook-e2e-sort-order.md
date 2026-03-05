---
'@workflow/core': patch
'@workflow/world-postgres': patch
---

Fix webhook e2e test to explicitly sort hooks in ascending order, and fix postgres world to respect sortOrder parameter in hooks.list
