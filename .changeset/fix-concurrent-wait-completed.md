---
'@workflow/world-local': patch
---

Fix concurrent `wait_completed` race condition that caused duplicate events and `Unconsumed event` errors during replay
