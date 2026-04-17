---
'@workflow/world-vercel': patch
---

Propagate consumer cancellation to upstream fetch in `streams.get`. Previously, cancelling a stream (e.g. a client disconnecting from an API endpoint returning `run.getReadable()`) could leave the pull loop reconnecting in the background.
