# AWS Step Functions -> Vercel Workflow

## Map these constructs

| AWS Step Functions | Vercel Workflow |
| --- | --- |
| ASL JSON state machine | `"use workflow"` function |
| Task / Lambda | `"use step"` |
| Choice | `if` / `else` / `switch` |
| Wait | `sleep()` |
| Parallel | `Promise.all()` |
| Map | loop or `Promise.all()` |
| Retry / Catch | step retries + `try` / `catch`, `RetryableError`, `FatalError`, `maxRetries` |
| `.waitForTaskToken` | `createHook()` or `createWebhook()` |
| `StartExecution` (child state machine) | step-wrapped `start()` / `getRun()` |

## Remove

- ASL JSON state machine definitions from final migrated code
- Separate Lambda function stubs that only served as Task state handlers
- Task-token plumbing (`SendTaskSuccess`, `SendTaskFailure`, SQS queue setup) after converting to hooks/webhooks
- IAM roles and CloudFormation/CDK resources for orchestrator-to-Lambda wiring
- `"Next"` / `"End"` transition logic — replaced by `await` and `return`

## Add

- Resume surface for `.waitForTaskToken`:
  - Use `createHook()` + `resumeHook()` when the app resumes the workflow from server-side code with a deterministic business token.
  - Use `createWebhook()` when the external system needs a generated callback URL or the migrated flow should receive a raw `Request`.
  - Choose exactly one surface. Do not pair `createWebhook()` with `resumeHook()`.
  - See `references/shared-patterns.md` -> `## Deterministic server-side resume`
  - See `references/shared-patterns.md` -> `## Generated callback URL`
- Explicit `Promise.all()` for parallel work (replaces Parallel state)
- Loops or `Promise.all()` over arrays for Map state equivalents
- Rollback stack when the original graph used compensation chains (Catch → compensation states)
- Idempotency keys on external writes via `getStepMetadata().stepId`
- `getWritable()` for progress streaming (Step Functions has no built-in equivalent)
- Step-wrapped `start()` / `getRun()` for child workflows (replaces `StartExecution`)
