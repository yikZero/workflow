# Golden: Partial Side Effect Compensation

## Sample Prompt

> /workflow-saga reserve inventory, charge payment, compensate on shipping failure

## Expected Context Fields

The `workflow-teach` stage should capture:

- `businessInvariants`: Inventory reservation and payment charge must be compensated if shipping fails
- `compensationRules`: Release inventory reservation on payment failure; refund payment on shipping failure
- `idempotencyRequirements`: Each compensation action must be safe to retry
- `observabilityRequirements`: Log saga.step-completed, saga.compensation-triggered, saga.rolled-back

## Expected WorkflowBlueprint

```json
{
  "contractVersion": "1",
  "name": "compensation-saga",
  "goal": "Orchestrate inventory, payment, and shipping with compensation for partial success",
  "trigger": { "type": "api_route", "entrypoint": "app/api/orders/route.ts" },
  "inputs": { "orderId": "string", "items": "OrderItem[]", "paymentMethodId": "string" },
  "steps": [
    { "name": "reserveInventory", "runtime": "step", "purpose": "Reserve inventory for order items", "sideEffects": ["database"], "idempotencyKey": "reserve:order-${orderId}", "failureMode": "fatal" },
    { "name": "chargePayment", "runtime": "step", "purpose": "Charge customer payment method", "sideEffects": ["api_call"], "idempotencyKey": "charge:order-${orderId}", "failureMode": "retryable" },
    { "name": "initiateShipping", "runtime": "step", "purpose": "Create shipping label and schedule pickup", "sideEffects": ["api_call"], "idempotencyKey": "ship:order-${orderId}", "failureMode": "retryable" },
    { "name": "refundPayment", "runtime": "step", "purpose": "Compensate: refund payment on shipping failure", "sideEffects": ["api_call"], "idempotencyKey": "refund:order-${orderId}", "failureMode": "retryable" },
    { "name": "releaseInventory", "runtime": "step", "purpose": "Compensate: release reserved inventory", "sideEffects": ["database"], "idempotencyKey": "release:order-${orderId}", "failureMode": "retryable" }
  ],
  "suspensions": [],
  "streams": [
    { "namespace": "saga-progress", "payload": "{ orderId: string, step: string, status: string }" }
  ],
  "tests": [
    { "name": "happy-path-all-steps-succeed", "helpers": ["start", "getRun"], "verifies": ["All three forward steps complete successfully"] },
    { "name": "shipping-failure-triggers-compensation", "helpers": ["start", "getRun"], "verifies": ["Shipping failure triggers refundPayment and releaseInventory"] },
    { "name": "payment-failure-releases-inventory", "helpers": ["start", "getRun"], "verifies": ["Payment failure triggers releaseInventory only"] },
    { "name": "compensation-is-idempotent", "helpers": ["start", "getRun"], "verifies": ["Compensation actions are safe to retry under replay"] }
  ],
  "antiPatternsAvoided": ["missing compensation for partial success", "non-idempotent rollback actions"],
  "invariants": [
    "Every successful forward step must have a matching compensation action",
    "Compensation must execute in reverse order of forward steps"
  ],
  "compensationPlan": [
    "Release inventory reservation on payment failure",
    "Refund payment on shipping failure",
    "Rollback all completed steps on any unrecoverable failure"
  ],
  "operatorSignals": [
    "Log saga.step-completed for each forward step",
    "Log saga.compensation-triggered when rollback begins",
    "Log saga.rolled-back with list of compensated steps"
  ]
}
```

## Expected Helper Coverage

- `start` — launch the workflow
- `getRun` — retrieve the workflow run handle
- `run.returnValue` — assert the final workflow output (success or compensated)
