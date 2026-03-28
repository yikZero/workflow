# Golden Scenario: Compensation Saga

## Scenario

A multi-step order fulfillment workflow that charges a payment, reserves inventory, and sends a confirmation email. If inventory reservation fails after payment has been charged, a compensation step must refund the payment.

## What the Build Skill Should Catch

### Phase 2 — Traps Flagged

1. **Rollback / compensation strategy** — Payment charging is an irreversible side effect. If `reserveInventory` fails after `chargePayment` succeeds, the workflow must refund the payment. A compensation step is required.
2. **Idempotency keys** — `chargePayment` and `reserveInventory` have external side effects. Derive idempotency keys from `orderId` (e.g. `payment:${orderId}`, `inventory:${orderId}`) to prevent duplicate charges on replay.

### Phase 3 — Failure Modes Decided

- `chargePayment`: `RetryableError` with `maxRetries: 3` for transient payment failures. `FatalError` for invalid card or insufficient funds.
- `reserveInventory`: `RetryableError` with `maxRetries: 2` for transient warehouse API failures. `FatalError` for out-of-stock (triggers compensation).
- `refundPayment`: `RetryableError` with `maxRetries: 5` — refund must eventually succeed.
- `sendConfirmation`: `RetryableError` with `maxRetries: 2` — email delivery is transient.
- Compensation: if `reserveInventory` throws `FatalError`, run `refundPayment` before terminating.

## Expected Code Output

```typescript
"use workflow";

import { FatalError, RetryableError } from "workflow";

const chargePayment = async (orderId: string, amount: number) => {
  "use step";
  // Idempotency key: payment:${orderId}
  const result = await paymentProvider.charge({
    idempotencyKey: `payment:${orderId}`,
    amount,
  });
  return result;
};

const reserveInventory = async (orderId: string, items: CartItem[]) => {
  "use step";
  // Idempotency key: inventory:${orderId}
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

export default async function orderFulfillment(
  orderId: string,
  amount: number,
  items: CartItem[],
  email: string
) {
  const charge = await chargePayment(orderId, amount);

  try {
    const reservation = await reserveInventory(orderId, items);
  } catch (error) {
    // Compensation: refund payment if inventory fails permanently
    if (error instanceof FatalError) {
      await refundPayment(orderId, charge.id);
      throw error;
    }
    throw error;
  }

  await sendConfirmation(orderId, email);

  return { orderId, status: "fulfilled" };
}
```

## Expected Test Output

```typescript
import { describe, it, expect } from "vitest";
import { start } from "workflow/api";
import orderFulfillment from "../workflows/order-fulfillment";

describe("orderFulfillment", () => {
  it("completes happy path", async () => {
    const run = await start(orderFulfillment, [
      "order-1",
      100,
      [{ sku: "A", qty: 1 }],
      "user@example.com",
    ]);
    await expect(run.returnValue).resolves.toEqual({
      orderId: "order-1",
      status: "fulfilled",
    });
  });

  it("refunds payment when inventory fails", async () => {
    // Mock reserveInventory to throw FatalError (out of stock)
    const run = await start(orderFulfillment, [
      "order-2",
      50,
      [{ sku: "B", qty: 999 }],
      "user@example.com",
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
  "blueprintName": "compensation-saga",
  "files": [
    { "kind": "workflow", "path": "workflows/order-fulfillment.ts" },
    { "kind": "test", "path": "workflows/order-fulfillment.integration.test.ts" }
  ],
  "testMatrix": [
    {
      "name": "happy-path",
      "helpers": [],
      "expects": "Order completes successfully with payment charged and inventory reserved"
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
    { "name": "focused-workflow-test", "command": "pnpm vitest run workflows/order-fulfillment.integration.test.ts", "expects": "order-fulfillment integration tests pass" }
  ],
  "implementationNotes": [
    "Invariant: A payment charge must be compensated by a refund if inventory reservation fails",
    "Invariant: Idempotency keys derived from orderId prevent duplicate charges on replay",
    "Operator signal: Log compensation.triggered with orderId when refund begins after inventory failure"
  ]
}
```

### Verification Summary

{"event":"verification_plan_ready","blueprintName":"compensation-saga","fileCount":2,"testCount":1,"runtimeCommandCount":3,"contractVersion":"1"}

## Checklist Items Exercised

- Rollback / compensation strategy
- Idempotency keys
- Retry semantics
- Integration test coverage
