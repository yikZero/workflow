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

## Expected `.workflow.md` Sections

### Project Context

E-commerce order processing. Needs durable workflows because Shopify webhooks have at-least-once delivery and the system must handle duplicates safely.

### Business Rules

- An order must not be charged twice for the same Shopify order ID.
- Inventory reservation must be idempotent — re-reserving the same order is a no-op.
- Payment charge uses idempotency key derived from Shopify order ID.
- Inventory reservation uses upsert keyed by order ID.

### External Systems

- Shopify (webhook source, at-least-once delivery). Trigger: `orders/create` webhook.
- Payment gateway (charge, refund). Rate-limited, has idempotency key support.
- Inventory service (reserve, release). Supports upsert.

### Failure Expectations

- Duplicate order ID after successful processing: permanent (skip).
- Payment gateway timeout: retryable.
- Webhook must respond within 30 seconds.
- Inventory hold expires after 15 minutes.
- Compensation: refund payment if inventory reservation fails after charge succeeds.

### Observability Needs

- Log webhook receipt with Shopify order ID.
- Log idempotency cache hit/miss for payment charge.
- Stream step progress to operator dashboard.

### Open Questions

(none for this scenario)

## Downstream Expectations

### workflow-build

When building this workflow, the build skill should:

- Flag idempotency requirements on every payment and inventory step
- Include compensation step for payment refund on inventory failure
- Produce tests for: happy path, duplicate webhook (no-op), inventory failure triggering refund
- Flag the 30-second webhook response timeout

## Verification Criteria

- [ ] Interview surfaces duplicate-safety as the first concern
- [ ] `.workflow.md` Business Rules captures both idempotency strategies
- [ ] `.workflow.md` Failure Expectations captures refund-on-inventory-failure
- [ ] `.workflow.md` Observability Needs captures idempotency cache logging
- [ ] Next skill recommendation is `workflow-build`
