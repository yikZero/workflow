---
'workflow': patch
'@workflow/core': patch
'@workflow/world-vercel': patch
---

Auto-reconnect non-byte `getReadable()` streams when the server aborts on its 2-minute connection limit. The client now counts fully-received frames at the framing layer and reopens the stream with an updated `startIndex`, replacing the earlier trailing-control-frame approach. `readFromStream` also wires an `AbortController` into its `fetch` so cancelling the returned stream tears down the HTTP request.
