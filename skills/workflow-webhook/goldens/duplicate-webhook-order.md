# Golden: Duplicate Webhook Order

## Sample Prompt

> /workflow-webhook ingest Stripe checkout completion safely

## Expected Context Fields

The `workflow-teach` stage should capture:

- `externalSystems`: Stripe payment provider
- `idempotencyRequirements`: Webhook delivery must be safe under duplicate events; charge must not double-fire
- `businessInvariants`: Each order must be fulfilled exactly once regardless of delivery count
- `compensationRules`: If fulfillment starts but payment confirmation is retracted, cancel pending shipment
- `observabilityRequirements`: Log webhook.received, webhook.deduplicated, order.fulfilled

## Expected WorkflowBlueprint

```json
{
  "contractVersion": "1",
  "name": "duplicate-webhook-order",
  "goal": "Process Stripe checkout webhooks with duplicate delivery safety",
  "trigger": { "type": "webhook", "entrypoint": "app/api/webhooks/stripe/route.ts" },
  "inputs": { "eventId": "string", "orderId": "string", "payload": "StripeCheckoutEvent" },
  "steps": [
    { "name": "deduplicateEvent", "runtime": "step", "purpose": "Check if this event ID was already processed", "sideEffects": ["database"], "idempotencyKey": "dedup:evt-${eventId}", "failureMode": "fatal" },
    { "name": "validatePayment", "runtime": "step", "purpose": "Verify payment status with Stripe API", "sideEffects": ["api_call"], "idempotencyKey": "validate:evt-${eventId}", "failureMode": "retryable" },
    { "name": "fulfillOrder", "runtime": "step", "purpose": "Mark order as fulfilled and trigger shipment", "sideEffects": ["database", "api_call"], "idempotencyKey": "fulfill:order-${orderId}", "failureMode": "retryable" },
    { "name": "sendConfirmation", "runtime": "step", "purpose": "Send order confirmation to customer", "sideEffects": ["email"], "idempotencyKey": "confirm:order-${orderId}", "failureMode": "retryable" }
  ],
  "suspensions": [
    { "kind": "webhook", "responseMode": "static" }
  ],
  "streams": [
    { "namespace": "webhook-processing", "payload": "{ eventId: string, status: string }" }
  ],
  "tests": [
    { "name": "single-delivery-fulfills-order", "helpers": ["start", "getRun", "waitForHook", "resumeWebhook"], "verifies": ["Normal webhook delivery triggers order fulfillment"] },
    { "name": "duplicate-delivery-is-idempotent", "helpers": ["start", "getRun", "waitForHook", "resumeWebhook"], "verifies": ["Second delivery of same event ID is safely deduplicated"] },
    { "name": "payment-validation-failure-is-fatal", "helpers": ["start", "getRun", "waitForHook", "resumeWebhook"], "verifies": ["Invalid payment status halts workflow with FatalError"] }
  ],
  "antiPatternsAvoided": ["processing webhooks without deduplication", "missing idempotency keys on side effects"],
  "invariants": [
    "Each order must be fulfilled exactly once regardless of delivery count",
    "Duplicate event IDs must be detected before any side effects execute"
  ],
  "compensationPlan": [
    "If fulfillment starts but payment is retracted, cancel pending shipment"
  ],
  "operatorSignals": [
    "Log webhook.received with event ID and order ID",
    "Log webhook.deduplicated when duplicate event is detected",
    "Log order.fulfilled with fulfillment confirmation"
  ]
}
```

## Expected Helper Coverage

- `start` — launch the workflow
- `getRun` — retrieve the workflow run handle
- `waitForHook` — wait for webhook registration
- `resumeWebhook` — deliver the webhook payload via `new Request()` with `JSON.stringify()`
- `run.returnValue` — assert the final workflow output
