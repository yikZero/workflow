# Golden: Approval Expiry Escalation

## Sample Prompt

> /workflow-approval refund approvals with escalation after 48h

## Expected Context Fields

The `workflow-teach` stage should capture:

- `approvalRules`: Manager approval required, director escalation after 48h
- `timeoutRules`: 48h manager window, 24h director window, auto-reject after 72h total
- `observabilityRequirements`: approval.requested, approval.escalated, approval.decided
- `businessInvariants`: A purchase order must receive exactly one final decision
- `idempotencyRequirements`: All notification sends idempotent by PO number
- `compensationRules`: Empty for read-only approval (no side effects to compensate)

## Expected WorkflowBlueprint

```json
{
  "contractVersion": "1",
  "name": "approval-expiry-escalation",
  "goal": "Route PO approval through manager with timeout escalation to director",
  "trigger": { "type": "api_route", "entrypoint": "app/api/purchase-orders/route.ts" },
  "inputs": { "poNumber": "string", "amount": "number", "requesterId": "string" },
  "steps": [
    { "name": "validatePurchaseOrder", "runtime": "step", "purpose": "Validate PO data and check thresholds", "sideEffects": [], "failureMode": "fatal" },
    { "name": "notifyManager", "runtime": "step", "purpose": "Send approval request to manager", "sideEffects": ["email"], "idempotencyKey": "notify-mgr:po-${poNumber}", "failureMode": "retryable" },
    { "name": "awaitManagerApproval", "runtime": "workflow", "purpose": "Wait for manager hook or 48h timeout", "sideEffects": [], "failureMode": "default" },
    { "name": "notifyDirector", "runtime": "step", "purpose": "Escalate to director after manager timeout", "sideEffects": ["email"], "idempotencyKey": "notify-dir:po-${poNumber}", "failureMode": "retryable" },
    { "name": "awaitDirectorApproval", "runtime": "workflow", "purpose": "Wait for director hook or 24h timeout", "sideEffects": [], "failureMode": "default" },
    { "name": "recordDecision", "runtime": "step", "purpose": "Persist final approval/rejection decision", "sideEffects": ["database"], "idempotencyKey": "decision:po-${poNumber}", "failureMode": "retryable" },
    { "name": "notifyRequester", "runtime": "step", "purpose": "Notify requester of final outcome", "sideEffects": ["email"], "idempotencyKey": "notify-req:po-${poNumber}", "failureMode": "retryable" }
  ],
  "suspensions": [
    { "kind": "hook", "tokenStrategy": "deterministic", "payloadType": "ApprovalDecision" },
    { "kind": "sleep", "duration": "48h" },
    { "kind": "hook", "tokenStrategy": "deterministic", "payloadType": "ApprovalDecision" },
    { "kind": "sleep", "duration": "24h" }
  ],
  "streams": [
    { "namespace": "approval-lifecycle", "payload": "{ status: string, actor: string, poNumber: string }" }
  ],
  "tests": [
    { "name": "manager-approves-within-window", "helpers": ["start", "getRun", "waitForHook", "resumeHook"], "verifies": ["Manager approval resolves workflow with approved status"] },
    { "name": "manager-timeout-escalates-to-director", "helpers": ["start", "getRun", "waitForHook", "waitForSleep", "wakeUp", "resumeHook"], "verifies": ["48h timeout triggers director escalation"] },
    { "name": "director-timeout-auto-rejects", "helpers": ["start", "getRun", "waitForSleep", "wakeUp"], "verifies": ["24h director timeout triggers auto-rejection"] },
    { "name": "full-escalation-path", "helpers": ["start", "getRun", "waitForHook", "waitForSleep", "wakeUp", "resumeHook"], "verifies": ["Complete escalation from manager through director timeout"] }
  ],
  "antiPatternsAvoided": ["non-deterministic hook tokens", "missing timeout pairing", "unbounded approval wait"],
  "invariants": [
    "A purchase order must receive exactly one final decision",
    "Escalation must only trigger after the manager timeout expires"
  ],
  "compensationPlan": [],
  "operatorSignals": [
    "Log approval.requested with PO number and assigned manager",
    "Log approval.escalated when manager timeout fires",
    "Log approval.decided with final outcome and deciding actor"
  ]
}
```

## Expected Helper Coverage

- `start` — launch the workflow
- `getRun` — retrieve the workflow run handle
- `waitForHook` — wait for hook registration (manager and director approval hooks)
- `resumeHook` — deliver approval/rejection decisions
- `waitForSleep` — wait for sleep suspension (48h and 24h timeouts)
- `wakeUp` — advance past sleep suspensions in tests
- `run.returnValue` — assert the final workflow output
