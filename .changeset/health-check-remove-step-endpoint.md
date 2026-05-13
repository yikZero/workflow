---
'@workflow/core': patch
'workflow': patch
'@workflow/cli': patch
'@workflow/world-local': patch
'@workflow/world-postgres': patch
'@workflow/web': patch
---

Drop the dead `/v1/step` queue route plumbing left over after #1338: the `step` health-check endpoint is removed (`wf health` now only checks `workflow` and treats `--endpoint=step`/`--endpoint=both` as deprecated aliases), and the queues in `@workflow/world-local`/`@workflow/world-postgres` no longer dispatch `__wkf_step_*` messages to the non-existent `/.well-known/workflow/v1/step` URL.
