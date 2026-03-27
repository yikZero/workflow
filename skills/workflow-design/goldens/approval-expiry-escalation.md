# Golden: Approval Expiry Escalation

## Scenario

A procurement system requires manager approval for purchase orders over $5,000.
If the manager does not approve within 48 hours, the request escalates to a
director. If the director does not respond within 24 hours, the request is
auto-rejected and the requester is notified. Each approval step uses a
deterministic hook token tied to the PO number.

## Prompt

> Design a workflow that routes purchase orders for manager approval, escalates
> to a director after 48 hours, and auto-rejects after a further 24 hours.

## Expected Blueprint Properties

| Property | Expected Value |
|----------|---------------|
| `name` | `approval-expiry-escalation` |
| `trigger.type` | `api_route` |
| `steps[].runtime` | Mix of `workflow` orchestration and `step` for I/O |
| `suspensions` | Must include two `{ kind: "hook", tokenStrategy: "deterministic" }` and two `{ kind: "sleep" }` entries |
| `steps` with side effects | Each must have an `idempotencyKey` |
| `invariants` | Must enforce single-decision and escalation-ordering rules |
| `compensationPlan` | Empty — approval flow is read-only until final decision |
| `operatorSignals` | Must log approval.requested, approval.escalated, approval.decided |

### Suspension Details

- **Manager hook:** `createHook()` with deterministic token `approval:po-${poNumber}`.
  Payload type: `{ approved: boolean; reviewer: string }`.
- **Manager timeout:** `sleep("48h")` — triggers escalation if manager does not respond.
- **Director hook:** `createHook()` with deterministic token `escalation:po-${poNumber}`.
  Payload type: `{ approved: boolean; reviewer: string }`.
- **Director timeout:** `sleep("24h")` — triggers auto-rejection if director does not respond.

## Expected Blueprint

```json
{
  "contractVersion": "1",
  "name": "approval-expiry-escalation",
  "goal": "Route PO approval through manager with timeout escalation to director and auto-rejection",
  "trigger": { "type": "api_route", "entrypoint": "app/api/purchase-orders/route.ts" },
  "inputs": { "poNumber": "string", "amount": "number", "requesterId": "string" },
  "steps": [
    {
      "name": "validatePurchaseOrder",
      "runtime": "step",
      "purpose": "Validate PO data and check for duplicates",
      "sideEffects": ["db.read"],
      "idempotencyKey": "validate:po-${poNumber}",
      "failureMode": "fatal"
    },
    {
      "name": "notifyManager",
      "runtime": "step",
      "purpose": "Send approval request notification to manager",
      "sideEffects": ["notification.send"],
      "idempotencyKey": "notify-manager:po-${poNumber}",
      "failureMode": "retryable",
      "maxRetries": 3
    },
    {
      "name": "awaitManagerApproval",
      "runtime": "workflow",
      "purpose": "Orchestrate manager approval hook with 48h timeout via Promise.race",
      "sideEffects": [],
      "failureMode": "default"
    },
    {
      "name": "notifyDirector",
      "runtime": "step",
      "purpose": "Send escalation notification to director",
      "sideEffects": ["notification.send"],
      "idempotencyKey": "notify-director:po-${poNumber}",
      "failureMode": "retryable",
      "maxRetries": 3
    },
    {
      "name": "awaitDirectorApproval",
      "runtime": "workflow",
      "purpose": "Orchestrate director escalation hook with 24h timeout via Promise.race",
      "sideEffects": [],
      "failureMode": "default"
    },
    {
      "name": "recordDecision",
      "runtime": "step",
      "purpose": "Persist final approval decision to database",
      "sideEffects": ["db.update"],
      "idempotencyKey": "decision:po-${poNumber}",
      "failureMode": "retryable",
      "maxRetries": 2
    },
    {
      "name": "notifyRequester",
      "runtime": "step",
      "purpose": "Notify requester of final decision",
      "sideEffects": ["notification.send"],
      "idempotencyKey": "notify-requester:po-${poNumber}",
      "failureMode": "retryable",
      "maxRetries": 3
    }
  ],
  "suspensions": [
    { "kind": "hook", "tokenStrategy": "deterministic", "payloadType": "ApprovalDecision" },
    { "kind": "sleep", "duration": "48h" },
    { "kind": "hook", "tokenStrategy": "deterministic", "payloadType": "ApprovalDecision" },
    { "kind": "sleep", "duration": "24h" }
  ],
  "streams": [],
  "tests": [
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
  "antiPatternsAvoided": [
    "Node.js APIs inside \"use workflow\"",
    "Side effects split across too many steps",
    "Direct stream I/O in workflow context",
    "createWebhook() with custom token",
    "start() called directly from workflow code",
    "Mutating step inputs without returning",
    "Missing idempotency for side effects"
  ],
  "invariants": [
    "A purchase order must receive exactly one final decision: approved, rejected, or auto-rejected",
    "Escalation must only trigger after the primary approval window expires"
  ],
  "compensationPlan": [],
  "operatorSignals": [
    "Log approval.requested with PO number and assigned manager",
    "Log approval.escalated with PO number and director",
    "Log approval.decided with final status and decision maker"
  ]
}
```

## Expected Anti-Pattern Callouts

The blueprint `antiPatternsAvoided` array must include:

- `Node.js APIs inside "use workflow"` — the workflow orchestrator must not use
  `fs`, `path`, `crypto`, or other Node.js built-ins.
- `Mutating step inputs without returning` — step functions must return updated
  values since they use pass-by-value semantics.
- `Missing idempotency for side effects` — every notification and DB write must
  have an idempotency strategy.
- `start() called directly from workflow code` — if child workflows are needed,
  they must be wrapped in a step.

## Expected Test Helpers

The blueprint `tests` array must include test entries using these helpers:

| Helper | Purpose |
|--------|---------|
| `start` | Launch the approval workflow |
| `waitForHook` | Wait for the workflow to reach an approval hook |
| `resumeHook` | Provide the approval payload to advance past the hook |
| `waitForSleep` | Wait for the workflow to enter a timeout sleep |
| `getRun` | Retrieve the run to call `wakeUp` |
| `wakeUp` | Advance past the sleep suspension to simulate timeout |

### Integration Test Skeleton

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

## Idempotency Rationale

Every step with external side effects has an idempotency key scoped to the PO number:

| Step | Idempotency Key | Rationale |
|------|----------------|-----------|
| `validatePurchaseOrder` | `validate:po-${poNumber}` | Prevents duplicate validation DB reads |
| `notifyManager` | `notify-manager:po-${poNumber}` | Prevents duplicate notification emails |
| `notifyDirector` | `notify-director:po-${poNumber}` | Prevents duplicate escalation emails |
| `recordDecision` | `decision:po-${poNumber}` | Prevents double-writing final decision |
| `notifyRequester` | `notify-requester:po-${poNumber}` | Prevents duplicate outcome emails |

## Verification Criteria

A blueprint produced by `workflow-design` for this scenario is correct if:

1. Both hooks use `createHook()` with deterministic tokens (not `createWebhook()`).
2. Two sleep suspensions are present: 48h for manager timeout, 24h for director timeout.
3. All step functions with side effects have `idempotencyKey` set.
4. The test plan includes `waitForHook`, `resumeHook`, `waitForSleep`, and `wakeUp`.
5. The `antiPatternsAvoided` array is non-empty and relevant.
6. `invariants` enforce single-decision and escalation-ordering rules.
7. `operatorSignals` cover the full approval lifecycle.
8. `compensationPlan` is empty (approval is read-only until decision).
