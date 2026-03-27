# Golden Scenario: Duplicate Webhook Order

## Scenario

An e-commerce platform receives order-placed webhooks from Shopify. The same webhook may be delivered multiple times due to Shopify's at-least-once delivery guarantee. The workflow must charge payment, reserve inventory, and send a confirmation — but must never double-charge or double-reserve on duplicate deliveries.

## Interview Context

The workflow-teach interview should surface these answers:

| Bucket | Expected Answer |
|--------|----------------|
| Workflow starter/emitter | Shopify `orders/create` webhook, may be delivered more than once |
| Repeat-safe side effects | Payment charge must use idempotency key from Shopify order ID; inventory reservation must be upsert-based |
| Permanent vs retryable | Duplicate order ID after successful processing is permanent (skip); payment gateway timeout is retryable |
| Approval actors | No human approval required |
| Timeout/expiry rules | Webhook must respond within 30 seconds; inventory hold expires after 15 minutes |
| Compensation requirements | If inventory reservation fails after payment, refund payment using idempotency key |
| Operator observability | Log webhook receipt with Shopify order ID, log idempotency cache hit/miss, stream step progress |

## Expected Context Fields

```json
{
  "businessInvariants": [
    "An order must not be charged twice for the same Shopify order ID",
    "Inventory reservation must be idempotent — re-reserving the same order is a no-op"
  ],
  "idempotencyRequirements": [
    "Payment charge uses idempotency key derived from Shopify order ID",
    "Inventory reservation uses upsert keyed by order ID"
  ],
  "approvalRules": [],
  "timeoutRules": [
    "Webhook response within 30 seconds",
    "Inventory hold expires after 15 minutes"
  ],
  "compensationRules": [
    "Refund payment if inventory reservation fails after charge succeeds"
  ],
  "observabilityRequirements": [
    "Log webhook receipt with Shopify order ID",
    "Log idempotency cache hit/miss for payment charge",
    "Stream step progress to operator dashboard"
  ]
}
```

## Downstream Expectations

### workflow-design

The blueprint must include:

- `invariants` echoing both business invariants above
- `compensationPlan` with a refund entry for inventory failure
- `operatorSignals` including idempotency cache observability
- Every payment/inventory step must have an `idempotencyKey`

### workflow-stress

Must flag:

- Missing idempotency key on any step with external side effects
- Missing compensation for payment-after-inventory-failure scenario
- Timeout policy for webhook response and inventory hold

### workflow-verify

Must generate:

- Test for duplicate webhook delivery (second call is a no-op)
- Test for inventory failure triggering payment refund
- Test for inventory hold expiry

## Verification Criteria

- [ ] Interview surfaces duplicate-safety as the first concern
- [ ] `idempotencyRequirements` captures both payment and inventory strategies
- [ ] `compensationRules` captures refund-on-inventory-failure
- [ ] `observabilityRequirements` captures idempotency cache logging
- [ ] Downstream blueprint includes `invariants`, `compensationPlan`, and `operatorSignals`
