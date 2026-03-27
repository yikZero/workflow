# Golden: Duplicate Webhook Order (Idempotency Focus)

## Sample Prompt

> /workflow-idempotency make duplicate webhook delivery safe

## Expected Context Fields

The `workflow-teach` stage should capture:

- `idempotencyRequirements`: Every side-effecting step must be keyed by event ID or order ID; duplicate webhook delivery must not cause double-charges or double-fulfillment
- `businessInvariants`: An order must be processed exactly once regardless of how many times the webhook fires
- `compensationRules`: If a duplicate slips through and causes double-charge, refund the duplicate
- `observabilityRequirements`: Log idempotency.check, idempotency.duplicate-detected, idempotency.processed

## Expected WorkflowBlueprint

```json
{
  "contractVersion": "1",
  "name": "duplicate-webhook-order",
  "goal": "Ensure webhook-triggered order processing is safe under duplicate delivery",
  "trigger": { "type": "webhook", "entrypoint": "app/api/webhooks/orders/route.ts" },
  "inputs": { "eventId": "string", "orderId": "string", "payload": "OrderEvent" },
  "steps": [
    { "name": "checkIdempotencyKey", "runtime": "step", "purpose": "Look up event ID in deduplication store", "sideEffects": ["database"], "idempotencyKey": "idem-check:evt-${eventId}", "failureMode": "fatal" },
    { "name": "processOrder", "runtime": "step", "purpose": "Execute order processing logic", "sideEffects": ["database", "api_call"], "idempotencyKey": "process:order-${orderId}", "failureMode": "retryable" },
    { "name": "recordProcessed", "runtime": "step", "purpose": "Mark event as processed in deduplication store", "sideEffects": ["database"], "idempotencyKey": "record:evt-${eventId}", "failureMode": "retryable" },
    { "name": "sendConfirmation", "runtime": "step", "purpose": "Notify customer of order completion", "sideEffects": ["email"], "idempotencyKey": "confirm:order-${orderId}", "failureMode": "retryable" }
  ],
  "suspensions": [
    { "kind": "webhook", "responseMode": "static" }
  ],
  "streams": [],
  "tests": [
    { "name": "first-delivery-processes-normally", "helpers": ["start", "getRun", "waitForHook", "resumeWebhook"], "verifies": ["First webhook delivery processes the order"] },
    { "name": "duplicate-delivery-short-circuits", "helpers": ["start", "getRun", "waitForHook", "resumeWebhook"], "verifies": ["Duplicate event ID skips processing and returns early"] },
    { "name": "retry-after-partial-failure-is-safe", "helpers": ["start", "getRun", "waitForHook", "resumeWebhook"], "verifies": ["Retry of partially-processed event resumes safely"] }
  ],
  "antiPatternsAvoided": ["missing idempotency keys", "processing without deduplication check", "non-deterministic side effects"],
  "invariants": [
    "An order must be processed exactly once regardless of delivery count",
    "Every side-effecting step must have an idempotency key"
  ],
  "compensationPlan": [
    "If duplicate charge detected, issue automatic refund"
  ],
  "operatorSignals": [
    "Log idempotency.check with event ID",
    "Log idempotency.duplicate-detected when duplicate is caught",
    "Log idempotency.processed with order completion status"
  ]
}
```

## Expected Helper Coverage

- `start` — launch the workflow
- `getRun` — retrieve the workflow run handle
- `waitForHook` — wait for webhook registration
- `resumeWebhook` — deliver the webhook payload via `new Request()` with `JSON.stringify()`
- `run.returnValue` — assert the final workflow output
