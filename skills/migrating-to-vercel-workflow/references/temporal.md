# Temporal -> Vercel Workflow

## Map these constructs

| Temporal | Vercel Workflow |
| --- | --- |
| Workflow Definition / Execution | `"use workflow"` + `start()` |
| Activity | `"use step"` |
| Worker + Task Queue | remove from app code |
| Signal | `createHook()` or `createWebhook()` |
| Query / Update | `getRun()` + app API, or hook-driven mutation |
| Child Workflow | step-wrapped `start()` / `getRun()` |
| Activity retry policy (`startToCloseTimeout`, `maximumAttempts`) | `maxRetries`, `RetryableError`, `FatalError` |
| Event history | run timeline / event log |

## Remove

- `proxyActivities` and Activity type imports
- Worker setup and polling loop
- Task Queue configuration and plumbing
- Signal handler boilerplate (`defineSignal`, `setHandler`, `condition`) after converting to hooks
- Separate Activity modules when side effects move into colocated `"use step"` functions

## Add

- Hook resume endpoint when the source used Signals — `createHook()` in workflow, `resumeHook()` in an API route
- `Promise.race()` with `sleep()` when the source Signal had a timeout or deadline
- Idempotency keys on external writes via `getStepMetadata().stepId`
- Rollback stack for compensation-heavy flows (replaces nested try/catch around each Activity)
- `getWritable()` for progress streaming (replaces custom progress Activities)
- Step-wrapped `start()` / `getRun()` for child workflows — return serializable `runId` values to the workflow
