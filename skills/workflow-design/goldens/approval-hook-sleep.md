# Golden: Approval with Hook and Sleep

## Scenario

A document-approval workflow that prepares a document, waits for human approval
via a deterministic hook, then sleeps for a grace period before publishing.

## Prompt

> Design a workflow that prepares a document, waits for manager approval, then
> publishes after a 24-hour grace period.

## Expected Blueprint Properties

| Property | Expected Value |
|----------|---------------|
| `name` | `document-approval` |
| `trigger.type` | `api_route` |
| `steps[].runtime` | Mix of `workflow` orchestration and `step` for I/O |
| `suspensions` | Must include `{ kind: "hook", tokenStrategy: "deterministic" }` and `{ kind: "sleep", duration: "24h" }` |
| `steps` with side effects | Each must have an `idempotencyKey` |
| `steps` with failure | `prepareDocument` uses `default`, `publishDocument` uses `retryable` with `maxRetries` |

### Suspension Details

- **Hook:** `createHook()` with a deterministic token like `approval:${documentId}`.
  The hook payload type should include `{ approved: boolean; reviewer: string }`.
- **Sleep:** After approval, sleep for 24 hours as a grace/cooling period before
  publishing. Uses `sleep("24h")`.

## Expected Anti-Pattern Callouts

The blueprint `antiPatternsAvoided` array must include:

- `Node.js APIs inside "use workflow"` — the workflow orchestrator must not use
  `fs`, `path`, `crypto`, or other Node.js built-ins.
- `Mutating step inputs without returning` — step functions must return updated
  values since they use pass-by-value semantics.
- `Missing idempotency for side effects` — the publish step must have an
  idempotency strategy to prevent double-publishing.
- `start() called directly from workflow code` — if child workflows are needed,
  they must be wrapped in a step.

## Expected Test Helpers

The blueprint `tests` array must include a test entry using these helpers:

| Helper | Purpose |
|--------|---------|
| `start` | Launch the approval workflow |
| `waitForHook` | Wait for the workflow to reach the approval hook |
| `resumeHook` | Provide the approval payload to advance past the hook |
| `waitForSleep` | Wait for the workflow to enter the grace-period sleep |
| `getRun` | Retrieve the run to call `wakeUp` |
| `wakeUp` | Advance past the sleep suspension |

### Integration Test Skeleton

```ts
import { describe, it, expect } from 'vitest';
import { start, getRun, resumeHook } from 'workflow/api';
import { waitForHook, waitForSleep } from '@workflow/vitest';
import { approvalWorkflow } from './approval';

describe('approvalWorkflow', () => {
  it('publishes when approved', async () => {
    const run = await start(approvalWorkflow, ['doc-123']);

    await waitForHook(run, { token: 'approval:doc-123' });
    await resumeHook('approval:doc-123', {
      approved: true,
      reviewer: 'alice',
    });

    const sleepId = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });

    await expect(run.returnValue).resolves.toEqual({
      status: 'published',
      reviewer: 'alice',
    });
  });

  it('rejects when not approved', async () => {
    const run = await start(approvalWorkflow, ['doc-456']);

    await waitForHook(run, { token: 'approval:doc-456' });
    await resumeHook('approval:doc-456', {
      approved: false,
      reviewer: 'bob',
    });

    await expect(run.returnValue).resolves.toEqual({
      status: 'rejected',
      reviewer: 'bob',
    });
  });
});
```

## Verification Criteria

A blueprint produced by `workflow-design` for this scenario is correct if:

1. The hook uses `createHook()` with a deterministic token (not `createWebhook()`).
2. The sleep suspension is present with an explicit duration.
3. All step functions with side effects have `idempotencyKey` set.
4. The publish step uses `RetryableError` with a `maxRetries` value.
5. The test plan includes `waitForHook`, `resumeHook`, `waitForSleep`, and `wakeUp`.
6. The `antiPatternsAvoided` array is non-empty and relevant.
