# Golden Scenario: Compensation Saga

## User Prompt

```
/workflow-saga Reserve inventory, charge payment, create shipment, and refund if shipment booking fails.
```

## Scenario

A multi-step order fulfillment workflow that reserves inventory, charges payment, and books a shipment. If shipment booking fails after payment has been charged and inventory reserved, the workflow must compensate by refunding the payment and releasing the inventory — in reverse order of the forward steps.

## Context Capture

The scenario skill checks for `.workflow.md` first. In this example it does not exist, so the focused saga-specific interview runs:

| Question | Expected Answer |
|----------|----------------|
| Side-effecting steps | Reserve inventory, charge payment, book shipment — all irreversible |
| Compensation ordering | On shipment failure: cancel shipment (no-op if not booked), refund payment, release inventory |
| Compensation idempotency | Refund: `refund:${orderId}`, Release: `release:${orderId}`, Cancel: `cancel-shipment:${orderId}` |
| Partial success semantics | Workflow terminates with error after compensation completes |
| Forward-recovery option | None — shipment failure is permanent (warehouse rejected) |
| Observability | Log compensation.triggered with orderId and failing step name |

The captured context is saved to `.workflow.md` with sections: Project Context, Business Rules, External Systems, Failure Expectations, Observability Needs, Approved Patterns, Open Questions.

## What the Scenario Skill Should Catch

### Phase 2 — Traps Flagged

1. **Rollback / compensation strategy** — Payment charging and inventory reservation are irreversible side effects. If `bookShipment` fails after both succeed, the workflow must refund the payment and release the inventory. A compensation chain is required.
2. **Compensation ordering** — Compensations must run in reverse order: refund payment first (most recent committed effect), then release inventory.
3. **Idempotency keys** — Every forward and compensation step has external side effects. Derive idempotency keys from `orderId` (e.g. `payment:${orderId}`, `inventory:${orderId}`, `refund:${orderId}`, `release:${orderId}`) to prevent duplicate effects on replay.

### Phase 3 — Failure Modes Decided

- `reserveInventory`: `RetryableError` with `maxRetries: 2` for transient warehouse API failures. `FatalError` for out-of-stock (no compensation needed — nothing committed yet).
- `chargePayment`: `RetryableError` with `maxRetries: 3` for transient payment failures. `FatalError` for invalid card or insufficient funds (compensate inventory only).
- `bookShipment`: `RetryableError` with `maxRetries: 2` for transient carrier failures. `FatalError` for permanent rejection (triggers full compensation).
- `refundPayment`: `RetryableError` with `maxRetries: 5` — refund must eventually succeed.
- `releaseInventory`: `RetryableError` with `maxRetries: 5` — release must eventually succeed.
- `sendConfirmation`: `RetryableError` with `maxRetries: 2` — email delivery is transient.

## Expected Code Output

```typescript
"use workflow";

import { FatalError, RetryableError } from "workflow";

const reserveInventory = async (orderId: string, items: CartItem[]) => {
  "use step";
  const reservation = await warehouse.reserve({
    idempotencyKey: `inventory:${orderId}`,
    items,
  });
  return reservation;
};

const chargePayment = async (orderId: string, amount: number) => {
  "use step";
  const result = await paymentProvider.charge({
    idempotencyKey: `payment:${orderId}`,
    amount,
  });
  return result;
};

const bookShipment = async (orderId: string, address: Address) => {
  "use step";
  const shipment = await carrier.book({
    idempotencyKey: `shipment:${orderId}`,
    address,
  });
  return shipment;
};

const refundPayment = async (orderId: string, chargeId: string) => {
  "use step";
  await paymentProvider.refund({
    idempotencyKey: `refund:${orderId}`,
    chargeId,
  });
};

const releaseInventory = async (orderId: string, reservationId: string) => {
  "use step";
  await warehouse.release({
    idempotencyKey: `release:${orderId}`,
    reservationId,
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

export default async function orderSaga(
  orderId: string,
  amount: number,
  items: CartItem[],
  address: Address,
  email: string
) {
  // Forward step 1: Reserve inventory
  const reservation = await reserveInventory(orderId, items);

  // Forward step 2: Charge payment
  let charge;
  try {
    charge = await chargePayment(orderId, amount);
  } catch (error) {
    // Compensate: release inventory
    if (error instanceof FatalError) {
      await releaseInventory(orderId, reservation.id);
      throw error;
    }
    throw error;
  }

  // Forward step 3: Book shipment
  try {
    await bookShipment(orderId, address);
  } catch (error) {
    // Compensate in reverse order: refund payment, then release inventory
    if (error instanceof FatalError) {
      await refundPayment(orderId, charge.id);
      await releaseInventory(orderId, reservation.id);
      throw error;
    }
    throw error;
  }

  // All forward steps succeeded
  await sendConfirmation(orderId, email);

  return { orderId, status: "fulfilled" };
}
```

## Expected Test Output

```typescript
import { describe, it, expect } from "vitest";
import { start } from "workflow/api";
import orderSaga from "../workflows/order-saga";

describe("orderSaga", () => {
  it("completes happy path", async () => {
    const run = await start(orderSaga, [
      "order-1", 100, [{ sku: "A", qty: 1 }], { street: "123 Main" }, "user@example.com",
    ]);
    await expect(run.returnValue).resolves.toEqual({
      orderId: "order-1",
      status: "fulfilled",
    });
  });

  it("compensates payment and inventory when shipment fails", async () => {
    // Mock bookShipment to throw FatalError (carrier rejected)
    const run = await start(orderSaga, [
      "order-2", 50, [{ sku: "B", qty: 1 }], { street: "456 Elm" }, "user@example.com",
    ]);
    await expect(run.returnValue).rejects.toThrow(FatalError);
    // Verify refundPayment and releaseInventory were called (compensation executed)
  });

  it("compensates inventory only when payment fails", async () => {
    // Mock chargePayment to throw FatalError (insufficient funds)
    const run = await start(orderSaga, [
      "order-3", 75, [{ sku: "C", qty: 1 }], { street: "789 Oak" }, "user@example.com",
    ]);
    await expect(run.returnValue).rejects.toThrow(FatalError);
    // Verify releaseInventory was called but refundPayment was not
  });
});
```

## Verification Artifact

```json
{
  "contractVersion": "1",
  "blueprintName": "order-saga",
  "files": [
    { "kind": "workflow", "path": "workflows/order-saga.ts" },
    { "kind": "test", "path": "workflows/order-saga.integration.test.ts" }
  ],
  "testMatrix": [
    {
      "name": "happy-path",
      "helpers": [],
      "expects": "Order completes successfully with inventory reserved, payment charged, and shipment booked"
    },
    {
      "name": "compensation-on-shipment-failure",
      "helpers": [],
      "expects": "Payment is refunded and inventory released when shipment booking fails"
    },
    {
      "name": "partial-compensation-on-payment-failure",
      "helpers": [],
      "expects": "Inventory is released when payment fails (no refund needed)"
    }
  ],
  "runtimeCommands": [
    { "name": "typecheck", "command": "pnpm typecheck", "expects": "No TypeScript errors" },
    { "name": "test", "command": "pnpm test", "expects": "All repository tests pass" },
    { "name": "focused-workflow-test", "command": "pnpm vitest run workflows/order-saga.integration.test.ts", "expects": "order-saga integration tests pass" }
  ],
  "implementationNotes": [
    "Invariant: Compensation runs in reverse order of committed forward steps",
    "Invariant: A payment charge must be compensated by a refund if shipment booking fails",
    "Invariant: Idempotency keys derived from orderId prevent duplicate charges on replay",
    "Operator signal: Log compensation.triggered with orderId when refund begins after shipment failure",
    "Operator signal: Log compensation.complete with orderId when all compensations finish"
  ]
}
```

### Verification Summary

{"event":"verification_plan_ready","blueprintName":"order-saga","fileCount":2,"testCount":1,"runtimeCommandCount":3,"contractVersion":"1"}

## Checklist Items Exercised

- Rollback / compensation strategy (reverse-order compensation chain)
- Compensation ordering (refund before release)
- Idempotency keys (stable keys on every forward and compensation step)
- Retry semantics (FatalError triggers compensation, RetryableError for transient failures)
- Integration test coverage (happy path, full compensation, partial compensation)
