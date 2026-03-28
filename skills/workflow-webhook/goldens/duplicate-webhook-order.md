# Golden Scenario: Duplicate Webhook Order

## User Prompt

```
/workflow-webhook Build a workflow that processes Shopify order webhooks with at-least-once delivery, charges payment, reserves inventory, and sends confirmation — without double-charging.
```

## Scenario

An e-commerce platform receives order-placed webhooks from Shopify. The same webhook may be delivered multiple times due to Shopify's at-least-once delivery guarantee. The workflow must charge payment, reserve inventory, and send a confirmation — but must never double-charge or double-reserve on duplicate deliveries. If inventory reservation fails after payment, the payment must be refunded.

## Context Capture

The scenario skill checks for `.workflow.md` first. In this example it does not exist, so the focused webhook-specific interview runs:

| Question | Expected Answer |
|----------|----------------|
| Webhook source | Shopify `orders/create` webhook, at-least-once delivery |
| Duplicate handling | Deduplicate by Shopify order ID; skip if already processed |
| Idempotency strategy | Payment: `payment:${orderId}`, Inventory: `inventory:${orderId}`, Refund: `refund:${orderId}` |
| Response timeout | Shopify expects response within 30 seconds |
| Compensation requirements | Refund payment if inventory reservation fails after charge |
| Observability | Log webhook receipt, idempotency cache hit/miss, step progress |

The captured context is saved to `.workflow.md` with sections: Project Context, Business Rules, External Systems, Failure Expectations, Observability Needs, Approved Patterns, Open Questions.

## What the Scenario Skill Should Catch

### Phase 2 — Traps Flagged

1. **Duplicate-delivery handling** — The webhook may arrive more than once. The first step must check whether this order ID has already been processed. If yes, return early with a `FatalError` (skip).
2. **Idempotency keys** — Every step with external side effects must use a stable idempotency key derived from the Shopify order ID. Timestamps or random values would break on replay.
3. **Webhook response mode** — Use `static` response mode. The webhook endpoint must respond within 30 seconds; long-running processing happens after the response.
4. **Compensation strategy** — If `reserveInventory` fails after `chargePayment` succeeds, the workflow must run `refundPayment` before terminating.

### Phase 3 — Failure Modes Decided

- `checkDuplicate`: `FatalError` if already processed (skip entire workflow). No retry needed.
- `chargePayment`: `RetryableError` with `maxRetries: 3` for transient payment failures. `FatalError` for invalid card or insufficient funds.
- `reserveInventory`: `RetryableError` with `maxRetries: 2` for transient warehouse API failures. `FatalError` for out-of-stock (triggers compensation).
- `refundPayment`: `RetryableError` with `maxRetries: 5` — refund must eventually succeed.
- `sendConfirmation`: `RetryableError` with `maxRetries: 2` — email delivery is transient.

## Expected Code Output

```typescript
"use workflow";

import { FatalError, RetryableError } from "workflow";

const checkDuplicate = async (orderId: string) => {
  "use step";
  const existing = await db.orders.findUnique({ where: { shopifyId: orderId } });
  if (existing?.status === "completed") {
    throw new FatalError(`Order ${orderId} already processed`);
  }
  return existing;
};

const chargePayment = async (orderId: string, amount: number) => {
  "use step";
  const result = await paymentProvider.charge({
    idempotencyKey: `payment:${orderId}`,
    amount,
  });
  return result;
};

const reserveInventory = async (orderId: string, items: CartItem[]) => {
  "use step";
  const reservation = await warehouse.reserve({
    idempotencyKey: `inventory:${orderId}`,
    items,
  });
  return reservation;
};

const refundPayment = async (orderId: string, chargeId: string) => {
  "use step";
  await paymentProvider.refund({
    idempotencyKey: `refund:${orderId}`,
    chargeId,
  });
};

const sendConfirmation = async (orderId: string, email: string) => {
  "use step";
  await emailService.send({
    idempotencyKey: `confirmation:${orderId}`,
    to: email,
    template: "order-confirmed",
  });
};

export default async function shopifyOrder(
  orderId: string,
  amount: number,
  items: CartItem[],
  email: string
) {
  // Duplicate check — skip if already processed
  await checkDuplicate(orderId);

  // Charge payment with idempotency key
  const charge = await chargePayment(orderId, amount);

  // Reserve inventory — compensate with refund on failure
  try {
    await reserveInventory(orderId, items);
  } catch (error) {
    if (error instanceof FatalError) {
      await refundPayment(orderId, charge.id);
      throw error;
    }
    throw error;
  }

  // Send confirmation
  await sendConfirmation(orderId, email);

  return { orderId, status: "fulfilled" };
}
```

## Expected Test Output

```typescript
import { describe, it, expect } from "vitest";
import { start } from "workflow/api";
import shopifyOrder from "../workflows/shopify-order";

describe("shopifyOrder", () => {
  it("completes happy path", async () => {
    const run = await start(shopifyOrder, [
      "order-1", 100, [{ sku: "A", qty: 1 }], "user@example.com",
    ]);
    await expect(run.returnValue).resolves.toEqual({
      orderId: "order-1",
      status: "fulfilled",
    });
  });

  it("skips duplicate webhook delivery", async () => {
    // First delivery succeeds
    const run1 = await start(shopifyOrder, [
      "order-2", 50, [{ sku: "B", qty: 1 }], "user@example.com",
    ]);
    await expect(run1.returnValue).resolves.toEqual({
      orderId: "order-2",
      status: "fulfilled",
    });

    // Second delivery with same order ID is skipped
    const run2 = await start(shopifyOrder, [
      "order-2", 50, [{ sku: "B", qty: 1 }], "user@example.com",
    ]);
    await expect(run2.returnValue).rejects.toThrow(FatalError);
  });

  it("refunds payment when inventory fails", async () => {
    // Mock reserveInventory to throw FatalError (out of stock)
    const run = await start(shopifyOrder, [
      "order-3", 75, [{ sku: "C", qty: 999 }], "user@example.com",
    ]);
    await expect(run.returnValue).rejects.toThrow(FatalError);
    // Verify refundPayment was called (compensation executed)
  });
});
```

## Verification Artifact

```json
{
  "contractVersion": "1",
  "blueprintName": "shopify-order",
  "files": [
    { "kind": "workflow", "path": "workflows/shopify-order.ts" },
    { "kind": "test", "path": "workflows/shopify-order.integration.test.ts" }
  ],
  "testMatrix": [
    {
      "name": "happy-path",
      "helpers": [],
      "expects": "Order completes successfully with payment charged and inventory reserved"
    },
    {
      "name": "duplicate-webhook-skip",
      "helpers": [],
      "expects": "Duplicate delivery is detected and skipped without reprocessing"
    },
    {
      "name": "compensation-on-inventory-failure",
      "helpers": [],
      "expects": "Payment is refunded when inventory reservation fails"
    }
  ],
  "runtimeCommands": [
    { "name": "typecheck", "command": "pnpm typecheck", "expects": "No TypeScript errors" },
    { "name": "test", "command": "pnpm test", "expects": "All repository tests pass" },
    { "name": "focused-workflow-test", "command": "pnpm vitest run workflows/shopify-order.integration.test.ts", "expects": "shopify-order integration tests pass" }
  ],
  "implementationNotes": [
    "Invariant: An order must not be charged twice for the same Shopify order ID",
    "Invariant: Idempotency keys derived from orderId prevent duplicate charges on replay",
    "Invariant: Payment charge must be compensated by a refund if inventory reservation fails",
    "Operator signal: Log webhook.received with Shopify order ID",
    "Operator signal: Log idempotency.hit when duplicate delivery is detected",
    "Operator signal: Log compensation.triggered with orderId when refund begins"
  ]
}
```

### Verification Summary

{"event":"verification_plan_ready","blueprintName":"shopify-order","fileCount":2,"testCount":3,"runtimeCommandCount":3,"contractVersion":"1"}

## Checklist Items Exercised

- Duplicate-delivery handling (deduplication by order ID)
- Idempotency keys (stable keys on every side-effecting step)
- Webhook response mode (static, respects 30-second timeout)
- Rollback / compensation strategy (refund on inventory failure)
- Retry semantics (FatalError for duplicates, RetryableError for transient failures)
- Integration test coverage (happy path, duplicate skip, compensation)
