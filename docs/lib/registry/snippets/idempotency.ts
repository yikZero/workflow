/**
 * Source snippets for the Idempotency registry entry.
 *
 * Pass the deterministic `stepId` from getStepMetadata() as the
 * Idempotency-Key header to non-idempotent external APIs (Stripe, etc.) so
 * retries and replays never duplicate side effects. Stripe-shaped example
 * — same pattern works with any provider that supports idempotency keys.
 */

export const idempotencyWorkflowSource = `import { getStepMetadata } from "workflow";

export async function chargeCustomer(customerId: string, amountCents: number) {
  "use workflow";

  const charge = await createCharge(customerId, amountCents);
  await sendReceipt(customerId, charge.id);

  return { customerId, chargeId: charge.id, status: "completed" as const };
}

// stepId is deterministic across retries and replays — perfect idempotency key.
async function createCharge(
  customerId: string,
  amountCents: number,
): Promise<{ id: string; amount: number }> {
  "use step";

  const { stepId } = getStepMetadata();

  const res = await fetch("https://api.stripe.com/v1/charges", {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.STRIPE_SECRET_KEY}\`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Stripe dedupes on this — same stepId always returns the same charge.
      "Idempotency-Key": stepId,
    },
    body: new URLSearchParams({
      amount: String(amountCents),
      currency: "usd",
      customer: customerId,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "unknown" }));
    throw new Error(\`Charge failed: \${error.message ?? res.status}\`);
  }

  return res.json();
}

async function sendReceipt(customerId: string, chargeId: string): Promise<void> {
  "use step";

  const { stepId } = getStepMetadata();

  await fetch("https://api.example.com/receipts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": stepId,
    },
    body: JSON.stringify({ customerId, chargeId }),
  });
}
`;

export const idempotencyStartRouteSource = `import { start } from "workflow/api";
import { NextResponse } from "next/server";
import { chargeCustomer } from "@/workflows/idempotency";

// POST /api/idempotency { customerId, amountCents }
export async function POST(request: Request) {
  const { customerId, amountCents } = await request.json();
  if (!customerId || typeof amountCents !== "number") {
    return NextResponse.json(
      { error: "customerId and amountCents are required" },
      { status: 400 },
    );
  }

  const run = await start(chargeCustomer, [customerId, amountCents]);
  return NextResponse.json({ runId: run.runId });
}
`;
