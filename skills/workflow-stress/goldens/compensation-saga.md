# Golden Scenario: Compensation Saga

## Scenario

A multi-step order fulfillment workflow that charges a payment, reserves inventory, and sends a confirmation email. If inventory reservation fails after payment has been charged, a compensation step must refund the payment.

## Input Blueprint (Defective)

```json
{
  "name": "order-fulfillment",
  "goal": "Process an order: charge payment, reserve inventory, send confirmation",
  "trigger": { "type": "api", "entrypoint": "app/api/orders/route.ts" },
  "inputs": { "orderId": "string", "amount": "number", "items": "CartItem[]" },
  "steps": [
    {
      "name": "chargePayment",
      "runtime": "step",
      "purpose": "Charge the customer via payment provider",
      "sideEffects": ["payment.charge"],
      "failureMode": "retryable",
      "maxRetries": 3
    },
    {
      "name": "reserveInventory",
      "runtime": "step",
      "purpose": "Reserve items in warehouse",
      "sideEffects": ["inventory.reserve"],
      "failureMode": "retryable",
      "maxRetries": 2
    },
    {
      "name": "sendConfirmation",
      "runtime": "step",
      "purpose": "Send order confirmation email",
      "sideEffects": ["email.send"],
      "failureMode": "default"
    }
  ],
  "suspensions": [],
  "streams": [{ "namespace": "order-progress", "payload": "string" }],
  "tests": [
    {
      "name": "happy path",
      "helpers": ["start"],
      "verifies": ["order completes successfully"]
    }
  ],
  "antiPatternsAvoided": ["Node.js API in workflow context"],
  "invariants": [],
  "compensationPlan": [],
  "operatorSignals": []
}
```

## Expected Critical Fixes

1. **Rollback / compensation strategy** — No compensation step exists for refunding payment if `reserveInventory` fails after `chargePayment` succeeds. Add a `refundPayment` compensation step triggered on inventory failure.
2. **Idempotency keys** — `chargePayment` and `reserveInventory` have external side effects but no `idempotencyKey`. Derive keys from `orderId` (e.g. `payment:${orderId}`, `inventory:${orderId}`).

## Expected Should Fix

1. **Integration test coverage** — Only a happy-path test exists. Add tests for payment failure, inventory failure with compensation, and email failure.
2. **Retry semantics** — `sendConfirmation` uses `"default"` failure mode. Email delivery is typically retryable; use `"retryable"` with `maxRetries: 2`.
3. **Anti-pattern coverage** — `antiPatternsAvoided` is incomplete. Should include "Missing idempotency for side effects".

## Checklist Items Exercised

- Rollback / compensation strategy
- Idempotency keys
- Retry semantics
- Integration test coverage
- Anti-pattern completeness
