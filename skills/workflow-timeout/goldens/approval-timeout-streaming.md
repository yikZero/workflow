# Golden: Approval Timeout Streaming

## Sample Prompt

> /workflow-timeout wait 24h for approval, then expire

## Expected Context Fields

The `workflow-teach` stage should capture:

- `timeoutRules`: 24h approval window, auto-reject on expiry
- `approvalRules`: Single approver with timeout enforcement
- `observabilityRequirements`: Stream progress updates, log timeout.started, timeout.fired, timeout.resolved

## Expected WorkflowBlueprint

```json
{
  "contractVersion": "1",
  "name": "approval-timeout-streaming",
  "goal": "Wait for approval with streaming progress and timeout expiry",
  "trigger": { "type": "api_route", "entrypoint": "app/api/approvals/route.ts" },
  "inputs": { "requestId": "string", "approverId": "string", "timeoutHours": "number" },
  "steps": [
    { "name": "notifyApprover", "runtime": "step", "purpose": "Send approval request with deadline", "sideEffects": ["email"], "idempotencyKey": "notify:req-${requestId}", "failureMode": "retryable" },
    { "name": "awaitApprovalOrTimeout", "runtime": "workflow", "purpose": "Race hook against sleep for timeout", "sideEffects": [], "failureMode": "default" },
    { "name": "streamProgress", "runtime": "step", "purpose": "Stream approval status to operator dashboard", "sideEffects": ["stream"], "failureMode": "default" },
    { "name": "recordOutcome", "runtime": "step", "purpose": "Persist approval or timeout outcome", "sideEffects": ["database"], "idempotencyKey": "outcome:req-${requestId}", "failureMode": "retryable" }
  ],
  "suspensions": [
    { "kind": "hook", "tokenStrategy": "deterministic", "payloadType": "ApprovalDecision" },
    { "kind": "sleep", "duration": "24h" }
  ],
  "streams": [
    { "namespace": "approval-progress", "payload": "{ requestId: string, status: string, elapsed: string }" }
  ],
  "tests": [
    { "name": "approval-before-timeout", "helpers": ["start", "getRun", "waitForHook", "resumeHook"], "verifies": ["Approval received before timeout resolves workflow"] },
    { "name": "timeout-fires-and-rejects", "helpers": ["start", "getRun", "waitForSleep", "wakeUp"], "verifies": ["Timeout expiry triggers auto-rejection"] },
    { "name": "streaming-progress-emitted", "helpers": ["start", "getRun", "waitForHook", "resumeHook"], "verifies": ["Progress stream events are emitted during wait"] }
  ],
  "antiPatternsAvoided": ["unbounded wait without timeout", "missing getWritable for progress streaming"],
  "invariants": [
    "Every approval request must resolve within the timeout window",
    "Timeout expiry must produce a definitive rejection"
  ],
  "compensationPlan": [],
  "operatorSignals": [
    "Log timeout.started with request ID and deadline",
    "Log timeout.fired when sleep expiry triggers",
    "Log timeout.resolved with final outcome"
  ]
}
```

## Expected Helper Coverage

- `start` — launch the workflow
- `getRun` — retrieve the workflow run handle
- `waitForHook` — wait for approval hook registration
- `resumeHook` — deliver approval decision
- `waitForSleep` — wait for sleep suspension (24h timeout)
- `wakeUp` — advance past sleep in tests
- `run.returnValue` — assert the final workflow output
