---
'@workflow/web': patch
---

Replay/Re-run probes the target deployment's specVersion via health check before recreating the run, so the correct queue transport (JSON for old deployments, CBOR for new) is used. Falls back to the original run's specVersion if the probe fails.
