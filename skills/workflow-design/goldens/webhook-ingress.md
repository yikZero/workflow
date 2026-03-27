# Golden: Webhook Ingestion

## Scenario

A payment-webhook ingestion workflow that receives an external webhook from a
payment provider, validates the payload, processes the payment, and updates the
order status.

## Prompt

> Design a workflow that ingests a webhook from Stripe, validates the signature,
> processes the payment, and updates the order in the database.

## Expected Blueprint Properties

| Property | Expected Value |
|----------|---------------|
| `name` | `payment-webhook` or similar |
| `trigger.type` | `webhook` or `api_route` |
| `steps[].runtime` | All I/O in `step`, orchestration in `workflow` |
| `suspensions` | Must include `{ kind: "webhook", responseMode: "static" }` |
| `steps` with side effects | Each must have an `idempotencyKey` |

### Suspension Details

- **Webhook:** Uses `createWebhook()` with `responseMode: "static"` to register
  an ingress point. The webhook does NOT use a custom/deterministic token — only
  `createHook()` supports that. The workflow suspends until an external system
  POSTs to the webhook URL.

### Step Boundaries

- `validateSignature` — a step that verifies the webhook payload authenticity
  (e.g. Stripe signature check). Uses `FatalError` on invalid signature.
- `processPayment` — a step that applies the payment to the account. Uses
  `RetryableError` with `maxRetries` for transient failures.
- `updateOrder` — a step that persists the order status. Must have an
  `idempotencyKey` to prevent duplicate writes.

## Expected Anti-Pattern Callouts

The blueprint `antiPatternsAvoided` array must include:

- `createWebhook() with a custom token` — webhooks generate their own tokens;
  only `createHook()` supports deterministic tokens.
- `Node.js APIs inside "use workflow"` — signature validation, database access,
  and HTTP calls must all live in steps.
- `Missing idempotency for side effects` — payment processing and order updates
  must be idempotent.
- `Over-granular step boundaries` — don't split a single logical operation
  (e.g. validate + parse) into separate steps unless independent retry is needed.

## Expected Test Helpers

The blueprint `tests` array must include a test entry using these helpers:

| Helper | Purpose |
|--------|---------|
| `start` | Launch the webhook ingestion workflow |
| `waitForHook` | Wait for the webhook to be registered |
| `resumeWebhook` | Simulate the external webhook POST |
| `getRun` | Retrieve the run to inspect final state |

### Integration Test Skeleton

```ts
import { describe, it, expect } from 'vitest';
import { start, resumeWebhook, getRun } from 'workflow/api';
import { waitForHook } from '@workflow/vitest';
import { paymentWebhookWorkflow } from './payment-webhook';

describe('paymentWebhookWorkflow', () => {
  it('processes a valid payment webhook', async () => {
    const run = await start(paymentWebhookWorkflow, ['order-789']);

    await waitForHook(run);
    await resumeWebhook(run, {
      status: 200,
      body: {
        type: 'payment_intent.succeeded',
        data: { orderId: 'order-789', amount: 4999 },
      },
    });

    await expect(run.returnValue).resolves.toEqual({
      status: 'completed',
      orderId: 'order-789',
    });
  });

  it('rejects invalid webhook signature', async () => {
    const run = await start(paymentWebhookWorkflow, ['order-000']);

    await waitForHook(run);
    await resumeWebhook(run, {
      status: 200,
      body: { type: 'invalid', signature: 'bad' },
    });

    await expect(run.returnValue).resolves.toEqual({
      status: 'failed',
      error: 'invalid_signature',
    });
  });
});
```

## Verification Criteria

A blueprint produced by `workflow-design` for this scenario is correct if:

1. The webhook uses `createWebhook()` (not `createHook()`) and does NOT pass a
   custom token.
2. `responseMode` is `"static"` (the webhook responds immediately, processing
   continues asynchronously).
3. Signature validation uses `FatalError` for invalid signatures.
4. Payment processing uses `RetryableError` with explicit `maxRetries`.
5. All steps with database writes have `idempotencyKey`.
6. The test uses `resumeWebhook` (not `resumeHook`) to simulate the external POST.
7. The `antiPatternsAvoided` array includes `createWebhook() with a custom token`.
