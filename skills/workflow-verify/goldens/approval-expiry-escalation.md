# Golden Scenario: Approval Expiry Escalation (Verify Stage)

## Scenario

Verification artifacts for the approval-expiry-escalation workflow, produced from
the stress-tested blueprint. This is **Stage 4 of 4** in the workflow skill loop:
teach → design → stress → verify.

## Files to Create

| File | Purpose |
|------|---------|
| `workflows/approval-expiry-escalation.ts` | Workflow function with `"use workflow"` orchestrating manager/director approval with timeout escalation, plus `"use step"` functions for validation, notifications, and decision recording |
| `app/api/purchase-orders/route.ts` | API route trigger entrypoint for PO submission |
| `workflows/approval-expiry-escalation.integration.test.ts` | Integration tests using `@workflow/vitest` covering happy path, escalation, and auto-rejection |

Each workflow file must place `"use workflow"` at the top of the orchestrator function and `"use step"` at the top of each step function (`validatePurchaseOrder`, `notifyManager`, `notifyDirector`, `recordDecision`, `notifyRequester`).

## Test Matrix

| Test Name | Helpers Used | Verifies |
|-----------|-------------|----------|
| manager approves within window | `start`, `waitForHook`, `resumeHook` | PO approved by manager, requester notified |
| manager timeout triggers director escalation and director approves | `start`, `waitForHook`, `waitForSleep`, `wakeUp`, `resumeHook` | escalation triggered after 48h, director approves PO |
| full timeout triggers auto-rejection | `start`, `waitForHook`, `waitForSleep`, `wakeUp` | auto-rejected after 72h total, requester notified of rejection |

### Invariant Assertions

From `invariants`:
- **"A purchase order must receive exactly one final decision"** → Assert that `run.returnValue` resolves to exactly one of `approved`, `rejected`, or `auto-rejected` in every test path. Assert that calling `resumeHook` a second time after decision does not change the outcome.
- **"Escalation must only trigger after the primary approval window expires"** → Assert that the director hook is not reachable until after the manager sleep is woken.

### Compensation Verification

From `compensationPlan` (empty):
- No compensation paths to test — approval flow is read-only until final decision. Verify that no undo/rollback steps exist in the workflow.

### Operator Signal Assertions

From `operatorSignals`:
- **`approval.requested`** → Assert log output includes PO number and assigned manager after workflow start.
- **`approval.escalated`** → Assert log output includes PO number and director after manager timeout.
- **`approval.decided`** → Assert log output includes final status (`approved`, `rejected`, or `auto-rejected`) and decision maker.

## Integration Test Skeleton

```ts
import { describe, it, expect } from 'vitest';
import { start, getRun, resumeHook } from 'workflow/api';
import { waitForHook, waitForSleep } from '@workflow/vitest';
import { approvalExpiryEscalation } from './approval-expiry-escalation';

describe('approvalExpiryEscalation', () => {
  it('manager approves within window', async () => {
    const run = await start(approvalExpiryEscalation, ['po-100', 6000, 'user-1']);

    await waitForHook(run, { token: 'approval:po-100' });
    await resumeHook('approval:po-100', {
      approved: true,
      reviewer: 'manager-alice',
    });

    await expect(run.returnValue).resolves.toEqual({
      status: 'approved',
      decidedBy: 'manager-alice',
      poNumber: 'po-100',
    });
  });

  it('manager timeout escalates to director who approves', async () => {
    const run = await start(approvalExpiryEscalation, ['po-200', 8000, 'user-2']);

    // Manager hook created — simulate 48h timeout instead of responding
    await waitForHook(run, { token: 'approval:po-200' });
    const sleepId = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });

    // Director escalation hook
    await waitForHook(run, { token: 'escalation:po-200' });
    await resumeHook('escalation:po-200', {
      approved: true,
      reviewer: 'director-bob',
    });

    await expect(run.returnValue).resolves.toEqual({
      status: 'approved',
      decidedBy: 'director-bob',
      poNumber: 'po-200',
    });
  });

  it('full timeout auto-rejects', async () => {
    const run = await start(approvalExpiryEscalation, ['po-300', 12000, 'user-3']);

    // Manager timeout
    await waitForHook(run, { token: 'approval:po-300' });
    const managerSleepId = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [managerSleepId] });

    // Director timeout
    await waitForHook(run, { token: 'escalation:po-300' });
    const directorSleepId = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [directorSleepId] });

    await expect(run.returnValue).resolves.toEqual({
      status: 'auto-rejected',
      decidedBy: 'system',
      poNumber: 'po-300',
    });
  });
});
```

## Runtime Verification Commands

```bash
# Start the dev server
cd workbench/nextjs-turbopack && pnpm dev

# Run integration tests
DEPLOYMENT_URL="http://localhost:3000" APP_NAME="nextjs-turbopack" \
  pnpm vitest run workflows/approval-expiry-escalation.integration.test.ts

# Run specific test
DEPLOYMENT_URL="http://localhost:3000" APP_NAME="nextjs-turbopack" \
  pnpm vitest run workflows/approval-expiry-escalation.integration.test.ts -t "manager approves"

# Trigger a PO approval manually
curl -X POST http://localhost:3000/api/purchase-orders \
  -H "Content-Type: application/json" \
  -d '{"poNumber": "po-test-1", "amount": 6000, "requesterId": "user-test"}'

# Inspect run state via CLI
pnpm wf runs list --workflow approval-expiry-escalation
pnpm wf runs get <run-id>
```

## Verification Artifact

Persisted to `.workflow-skills/verification/approval-expiry-escalation.json`:

```json
{
  "contractVersion": "1",
  "blueprintName": "approval-expiry-escalation",
  "files": [
    {
      "path": "workflows/approval-expiry-escalation.ts",
      "kind": "workflow",
      "purpose": "Workflow orchestration and step implementations"
    },
    {
      "path": "app/api/purchase-orders/route.ts",
      "kind": "route",
      "purpose": "Entrypoint that starts or resumes the workflow"
    },
    {
      "path": "workflows/approval-expiry-escalation.integration.test.ts",
      "kind": "test",
      "purpose": "Integration coverage for hooks, sleeps, retries, and return values"
    }
  ],
  "testMatrix": [
    {
      "name": "manager approves within window",
      "helpers": ["start", "waitForHook", "resumeHook"],
      "verifies": ["PO approved by manager", "requester notified"]
    },
    {
      "name": "manager timeout triggers director escalation and director approves",
      "helpers": ["start", "waitForHook", "waitForSleep", "wakeUp", "resumeHook"],
      "verifies": ["escalation triggered after 48h", "director approves PO"]
    },
    {
      "name": "full timeout triggers auto-rejection",
      "helpers": ["start", "waitForHook", "waitForSleep", "wakeUp"],
      "verifies": ["auto-rejected after 72h total", "requester notified of rejection"]
    }
  ],
  "runtimeCommands": [
    {
      "name": "typecheck",
      "command": "pnpm typecheck",
      "expects": "No TypeScript errors"
    },
    {
      "name": "test",
      "command": "pnpm test",
      "expects": "All repository tests pass"
    },
    {
      "name": "focused-workflow-test",
      "command": "pnpm vitest run workflows/approval-expiry-escalation.integration.test.ts",
      "expects": "approval-expiry-escalation integration tests pass"
    }
  ],
  "implementationNotes": [
    "Invariant: A purchase order must receive exactly one final decision: approved, rejected, or auto-rejected",
    "Invariant: Escalation must only trigger after the primary approval window expires",
    "Operator signal: Log approval.requested with PO number and assigned manager",
    "Operator signal: Log approval.escalated with PO number and director"
  ]
}
```
