# Golden Scenario: Approval Timeout with Streaming

## Scenario

An expense approval workflow that waits for a manager's hook-based approval with a 24-hour timeout (sleep). While waiting, it streams status updates to the UI. If the timeout expires, the request is auto-escalated.

## Input Blueprint (Defective)

```json
{
  "name": "expense-approval",
  "goal": "Route expense reports for manager approval with timeout escalation and real-time status streaming",
  "trigger": { "type": "api", "entrypoint": "app/api/expenses/route.ts" },
  "inputs": { "expenseId": "string", "amount": "number", "managerId": "string" },
  "steps": [
    {
      "name": "validateExpense",
      "runtime": "step",
      "purpose": "Validate expense data and check for duplicates",
      "sideEffects": ["db.read"],
      "idempotencyKey": "validate:${expenseId}",
      "failureMode": "fatal"
    },
    {
      "name": "notifyManager",
      "runtime": "step",
      "purpose": "Send approval request notification",
      "sideEffects": ["notification.send"],
      "idempotencyKey": "notify:${expenseId}",
      "failureMode": "retryable",
      "maxRetries": 3
    },
    {
      "name": "streamStatus",
      "runtime": "workflow",
      "purpose": "Write waiting status to UI stream",
      "sideEffects": ["stream.write"],
      "failureMode": "default"
    },
    {
      "name": "processDecision",
      "runtime": "step",
      "purpose": "Apply approval or rejection to the expense record",
      "sideEffects": ["db.update"],
      "idempotencyKey": "decision:${expenseId}",
      "failureMode": "retryable",
      "maxRetries": 2
    },
    {
      "name": "escalateOnTimeout",
      "runtime": "step",
      "purpose": "Auto-escalate to VP if manager does not respond in time",
      "sideEffects": ["notification.send", "db.update"],
      "idempotencyKey": "escalate:${expenseId}",
      "failureMode": "retryable",
      "maxRetries": 2
    }
  ],
  "suspensions": [
    { "kind": "hook", "tokenStrategy": "deterministic", "payloadType": "ApprovalDecision" },
    { "kind": "sleep", "duration": "24h" }
  ],
  "streams": [{ "namespace": "expense-status", "payload": "string" }],
  "tests": [
    {
      "name": "manager approves before timeout",
      "helpers": ["start", "waitForHook", "resumeHook"],
      "verifies": ["expense approved"]
    }
  ],
  "antiPatternsAvoided": ["Node.js API in workflow context", "createWebhook with custom token"]
}
```

## Expected Critical Fixes

1. **Stream I/O placement** — `streamStatus` has `runtime: "workflow"` with `sideEffects: ["stream.write"]`. While `getWritable()` may be called in workflow context, direct stream writes (`write()`, `close()`) must happen in a `"use step"` function. Change either: (a) move the actual write call into a step, or (b) obtain the writable in workflow context and pass it to a step for I/O.
2. **Determinism boundary** — `streamStatus` is marked as a workflow function but lists `stream.write` as a side effect. Workflow functions orchestrate only — no side effects. The stream write is I/O and must live in a step.

## Expected Should Fix

1. **Integration test coverage** — No test for the timeout path. Add a test using `waitForSleep` and `wakeUp` that verifies escalation fires when the manager does not respond within 24 hours.
2. **Integration test coverage** — No test verifying stream output. Consider a test that checks the `expense-status` stream emits expected status messages.
3. **Hook token strategy** — The hook should use a token like `approval:${expenseId}` to be deterministic and collision-free. Verify this is explicitly documented in the blueprint.
4. **Retry semantics** — `validateExpense` uses `"fatal"` which is correct for invalid data, but a database read failure is transient. Consider splitting validation logic (fatal) from database access (retryable).

## Checklist Items Exercised

- Stream I/O placement (`getWritable()` may be called in workflow context but writes stay in steps)
- Determinism boundary
- Integration test coverage (timeout path, stream verification)
- Hook token strategy
- Retry semantics
