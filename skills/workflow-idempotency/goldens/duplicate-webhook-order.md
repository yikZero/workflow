# Golden Scenario: Duplicate Webhook Order (Idempotency Focus)

## User Prompt

```
/workflow-idempotency Make duplicate Stripe checkout events safe without double-charging or double-emailing.
```

## Scenario

An e-commerce platform receives checkout completion events from Stripe. Due to Stripe's at-least-once delivery guarantee, the same event may arrive multiple times. The workflow must charge payment, reserve inventory, and send a confirmation email — but must never double-charge, double-reserve, or double-email on duplicate deliveries or replay. If inventory reservation fails after payment, the payment must be refunded using its own idempotency key.

## Context Capture

The scenario skill checks for `.workflow.md` first. In this example it does not exist, so the focused idempotency-specific interview runs:

| Question | Expected Answer |
|----------|----------------|
| Duplicate ingress | Stripe checkout events use at-least-once delivery; deduplicate by Stripe event ID |
| Replay safety | Payment charge, inventory reservation, and confirmation email all produce external side effects that must not duplicate on replay |
| Idempotency key strategy | Payment: `payment:${eventId}`, Inventory: `inventory:${eventId}`, Notification: `notify:${eventId}`, Refund: `refund:${eventId}` |
| External provider support | Stripe accepts idempotency keys natively; warehouse API supports upsert by key; email provider deduplicates by message ID |
| Compensation requirements | Refund payment if inventory reservation fails after charge |
| Observability | Log duplicate detection (idempotency cache hit/miss), step completion with idempotency key used, compensation events |

The captured context is saved to `.workflow.md` with sections: Project Context, Business Rules, External Systems, Failure Expectations, Observability Needs, Approved Patterns, Open Questions.

## What the Scenario Skill Should Catch

### Phase 2 — Traps Flagged

1. **Idempotency keys on every side-effecting step** — Payment charge, inventory reservation, confirmation email, and refund all need stable idempotency keys derived from the Stripe event ID. Timestamps or random values would break on replay.
2. **Duplicate ingress detection** — The first step must check whether this event ID has already been processed. If yes, return early with a `FatalError` (skip). This prevents the entire workflow from re-executing on duplicate delivery.
3. **Replay safety** — The workflow runtime replays the event log on cold start. Every step must produce the same result on replay because idempotency keys are stable.
4. **Compensation idempotency** — If `reserveInventory` fails after `chargePayment` succeeds, the refund step must use its own idempotency key (`refund:${eventId}`) to prevent double-refunding on replay.

### Phase 3 — Failure Modes Decided

- `checkDuplicate`: `FatalError` if already processed (skip entire workflow). No retry needed.
- `chargePayment`: `RetryableError` with `maxRetries: 3` for transient Stripe failures. `FatalError` for invalid card or insufficient funds.
- `reserveInventory`: `RetryableError` with `maxRetries: 2` for transient warehouse API failures. `FatalError` for out-of-stock (triggers compensation).
- `refundPayment`: `RetryableError` with `maxRetries: 5` — refund must eventually succeed. Uses `refund:${eventId}` idempotency key.
- `sendConfirmation`: `RetryableError` with `maxRetries: 2` — email delivery is transient. Uses `notify:${eventId}` idempotency key.

## Expected Code Output

```typescript
"use workflow";

import { FatalError, RetryableError } from "workflow";

const checkDuplicate = async (eventId: string) => {
  "use step";
  const existing = await db.events.findUnique({ where: { stripeEventId: eventId } });
  if (existing?.status === "completed") {
    throw new FatalError(`Event ${eventId} already processed`);
  }
  return existing;
};

const chargePayment = async (eventId: string, amount: number) => {
  "use step";
  const result = await stripe.charges.create({
    amount,
    idempotencyKey: `payment:${eventId}`,
  });
  return result;
};

const reserveInventory = async (eventId: string, items: LineItem[]) => {
  "use step";
  const reservation = await warehouse.reserve({
    idempotencyKey: `inventory:${eventId}`,
    items,
  });
  return reservation;
};

const refundPayment = async (eventId: string, chargeId: string) => {
  "use step";
  await stripe.refunds.create({
    chargeId,
    idempotencyKey: `refund:${eventId}`,
  });
};

const sendConfirmation = async (eventId: string, email: string) => {
  "use step";
  await emailService.send({
    idempotencyKey: `notify:${eventId}`,
    to: email,
    template: "checkout-confirmed",
  });
};

export default async function stripeCheckout(
  eventId: string,
  amount: number,
  items: LineItem[],
  email: string
) {
  // Duplicate ingress check — skip if already processed
  await checkDuplicate(eventId);

  // Charge payment with stable idempotency key
  const charge = await chargePayment(eventId, amount);

  // Reserve inventory — compensate with refund on failure
  try {
    await reserveInventory(eventId, items);
  } catch (error) {
    if (error instanceof FatalError) {
      // Compensation with its own idempotency key
      await refundPayment(eventId, charge.id);
      throw error;
    }
    throw error;
  }

  // Send confirmation with idempotency key
  await sendConfirmation(eventId, email);

  return { eventId, status: "fulfilled" };
}
```

## Expected Test Output

```typescript
import { describe, it, expect } from "vitest";
import { start } from "workflow/api";
import stripeCheckout from "../workflows/stripe-checkout";

describe("stripeCheckout idempotency", () => {
  it("completes happy path with idempotency keys", async () => {
    const run = await start(stripeCheckout, [
      "evt_001", 100, [{ sku: "A", qty: 1 }], "user@example.com",
    ]);
    await expect(run.returnValue).resolves.toEqual({
      eventId: "evt_001",
      status: "fulfilled",
    });
  });

  it("skips duplicate event delivery", async () => {
    // First delivery succeeds
    const run1 = await start(stripeCheckout, [
      "evt_002", 50, [{ sku: "B", qty: 1 }], "user@example.com",
    ]);
    await expect(run1.returnValue).resolves.toEqual({
      eventId: "evt_002",
      status: "fulfilled",
    });

    // Second delivery with same event ID is skipped
    const run2 = await start(stripeCheckout, [
      "evt_002", 50, [{ sku: "B", qty: 1 }], "user@example.com",
    ]);
    await expect(run2.returnValue).rejects.toThrow(FatalError);
  });

  it("refunds payment with idempotency key when inventory fails", async () => {
    // Mock reserveInventory to throw FatalError (out of stock)
    const run = await start(stripeCheckout, [
      "evt_003", 75, [{ sku: "C", qty: 999 }], "user@example.com",
    ]);
    await expect(run.returnValue).rejects.toThrow(FatalError);
    // Verify refundPayment was called with refund:evt_003 idempotency key
  });
});
```

## Verification Artifact

```json
{
  "contractVersion": "1",
  "blueprintName": "stripe-checkout",
  "files": [
    { "kind": "workflow", "path": "workflows/stripe-checkout.ts" },
    { "kind": "test", "path": "workflows/stripe-checkout.integration.test.ts" }
  ],
  "testMatrix": [
    {
      "name": "happy-path-with-idempotency",
      "helpers": [],
      "expects": "Checkout completes with idempotency keys on every side-effecting step"
    },
    {
      "name": "duplicate-event-skip",
      "helpers": [],
      "expects": "Duplicate delivery is detected and skipped without reprocessing"
    },
    {
      "name": "compensation-with-idempotency-key",
      "helpers": [],
      "expects": "Payment is refunded with refund:${eventId} key when inventory fails"
    }
  ],
  "runtimeCommands": [
    { "name": "typecheck", "command": "pnpm typecheck", "expects": "No TypeScript errors" },
    { "name": "test", "command": "pnpm test", "expects": "All repository tests pass" },
    { "name": "focused-workflow-test", "command": "pnpm vitest run workflows/stripe-checkout.integration.test.ts", "expects": "stripe-checkout integration tests pass" }
  ],
  "implementationNotes": [
    "Invariant: Every side-effecting step uses a stable idempotency key derived from the Stripe event ID",
    "Invariant: Duplicate event delivery is detected and skipped at ingress",
    "Invariant: Replayed steps produce the same result because idempotency keys are stable",
    "Invariant: Compensation refund uses its own idempotency key to prevent double-refunding on replay",
    "Operator signal: Log idempotency.hit when duplicate delivery is detected",
    "Operator signal: Log compensation.triggered with eventId when refund begins"
  ]
}
```

### Verification Summary

{"event":"verification_plan_ready","blueprintName":"stripe-checkout","fileCount":2,"testCount":1,"runtimeCommandCount":3,"contractVersion":"1"}

## Checklist Items Exercised

- Idempotency keys (stable keys on every side-effecting step, derived from Stripe event ID)
- Duplicate delivery detection (deduplication by event ID at ingress)
- Replay safety (stable idempotency keys survive event log replay)
- Compensation idempotency (refund step has its own stable key)
- Retry semantics (FatalError for duplicates and permanent failures, RetryableError for transient)
- Integration test coverage (happy path, duplicate skip, compensation with idempotency)
