---
"@workflow/next": patch
---

fix(next): guard socket-info filesystem fallback behind lazy discovery flag

Prevents `ECONNREFUSED` during `next build` when a stale `workflow-socket.json` file exists from a previous `next dev` session.
