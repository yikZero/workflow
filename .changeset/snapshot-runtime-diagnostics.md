---
"@workflow/core": patch
---

Snapshot runtime: add CI-visible diagnostic checkpoint logs at every major step of the suspension/restore lifecycle (`SNAPSHOT_DIAG`), plus matching entry/exit logs in the workflow and step queue handlers (`WORKFLOW_HANDLER_DIAG`, `STEP_HANDLER_DIAG`). Each record carries a per-invocation id, runId, elapsed time, and structured fields (snapshot bytes, events fetched, pending op summary, outcome). Always emitted at `warn` level so they survive Vercel function-log collection without `DEBUG`. Used by the e2e diagnostic harness to grep wedged-run activity straight from the deployment's `/v3/deployments/:id/events` endpoint when a test fails.
