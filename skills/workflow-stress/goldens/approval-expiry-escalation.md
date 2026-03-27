# Golden Scenario: Approval Expiry Escalation (Defective Blueprint)

## Scenario

A procurement approval workflow with manager and director escalation. This
defective blueprint is missing timeout handling, has incomplete test coverage,
and lacks operator observability for the escalation path.

## Input Blueprint (Defective)

```json
{
  "contractVersion": "1",
  "name": "approval-expiry-escalation",
  "goal": "Route PO approval through manager with timeout escalation to director",
  "trigger": { "type": "api_route", "entrypoint": "app/api/purchase-orders/route.ts" },
  "inputs": { "poNumber": "string", "amount": "number", "requesterId": "string" },
  "steps": [
    {
      "name": "validatePurchaseOrder",
      "runtime": "step",
      "purpose": "Validate PO data",
      "sideEffects": ["db.read"],
      "failureMode": "fatal"
    },
    {
      "name": "notifyManager",
      "runtime": "step",
      "purpose": "Send approval request notification to manager",
      "sideEffects": ["notification.send"],
      "failureMode": "retryable",
      "maxRetries": 3
    },
    {
      "name": "recordDecision",
      "runtime": "step",
      "purpose": "Persist final approval decision to database",
      "sideEffects": ["db.update"],
      "failureMode": "retryable",
      "maxRetries": 2
    }
  ],
  "suspensions": [
    { "kind": "hook", "tokenStrategy": "deterministic", "payloadType": "ApprovalDecision" }
  ],
  "streams": [],
  "tests": [
    {
      "name": "manager approves",
      "helpers": ["start", "waitForHook", "resumeHook"],
      "verifies": ["PO approved"]
    }
  ],
  "antiPatternsAvoided": ["Node.js API in workflow context"],
  "invariants": [
    "A purchase order must receive exactly one final decision"
  ],
  "compensationPlan": [],
  "operatorSignals": [
    "Log approval.requested with PO number"
  ]
}
```

## Expected Critical Fixes

1. **Idempotency keys** — `validatePurchaseOrder`, `notifyManager`, and `recordDecision` all have external side effects but are missing `idempotencyKey` fields. On replay, these steps will re-execute without deduplication. Add keys scoped to the PO number: `validate:po-${poNumber}`, `notify-manager:po-${poNumber}`, `decision:po-${poNumber}`.

2. **Missing escalation path** — The blueprint has only one hook suspension for manager approval but no second hook for director escalation. Add a `{ kind: "hook", tokenStrategy: "deterministic", payloadType: "ApprovalDecision" }` for the director with token `escalation:po-${poNumber}`.

3. **Missing timeout suspensions** — There are no sleep suspensions to enforce the 48h manager timeout or the 24h director timeout. Without these, the workflow will wait indefinitely on an unresponsive approver. Add `{ kind: "sleep", duration: "48h" }` and `{ kind: "sleep", duration: "24h" }`.

## Expected Should Fix

1. **Integration test coverage** — No test for the escalation path (manager timeout → director approval). Add a test using `waitForHook`, `waitForSleep`, `wakeUp`, and `resumeHook` that verifies escalation fires when the manager does not respond within 48 hours.

2. **Integration test coverage** — No test for the auto-rejection path (both approvers time out). Add a test using `waitForHook`, `waitForSleep`, and `wakeUp` that verifies auto-rejection after the full 72-hour window.

3. **Operator observability gaps** — `operatorSignals` only logs `approval.requested` but is missing `approval.escalated` (escalation trigger) and `approval.decided` (final status). These signals are needed to trace the full approval lifecycle.

4. **Invariant completeness** — The single invariant enforces one final decision but does not encode the escalation-ordering rule: "Escalation must only trigger after the primary approval window expires."

5. **Retry semantics** — `validatePurchaseOrder` uses `"fatal"` which is correct for invalid data, but a database read failure is transient. Consider splitting validation logic (fatal) from database access (retryable).

## Checklist Items Exercised

- Idempotency keys
- Hook token strategy (deterministic tokens for both approval actors)
- Integration test coverage (escalation path, auto-rejection path)
- Rollback / compensation (confirmed empty — read-only approval flow)
- Observability streams (operator signals for full lifecycle)
- Retry semantics (fatal vs retryable for validation step)
- Determinism boundary (workflow orchestrates, steps perform I/O)
- Stream I/O placement (no streams in this workflow — N/A)

## Blueprint Patch

The corrected blueprint after applying all critical and should-fix items:

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
