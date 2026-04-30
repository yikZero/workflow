/**
 * Source snippets for the Saga / Transactions & Rollbacks registry entry.
 *
 * Multi-step business transaction with automatic compensation on failure.
 * Each forward step pushes an undo onto a stack; on FatalError the stack is
 * unwound in LIFO order to restore consistency. Drop-in starter for
 * "reserve → charge → provision → notify" style flows.
 */

export const sagaWorkflowSource = `import { FatalError } from "workflow";

// Forward steps + matching compensations. Replace the API calls below
// with your real services. Compensations MUST be idempotent — they may be
// retried if the workflow restarts mid-rollback.
export async function subscriptionUpgradeSaga(accountId: string, seats: number) {
  "use workflow";

  // Each entry is { name, undo } so we can label what's being rolled back.
  const compensations: Array<{ name: string; undo: () => Promise<void> }> = [];

  try {
    const reservationId = await reserveSeats(accountId, seats);
    compensations.push({
      name: "Release seats",
      undo: () => releaseSeats(accountId, reservationId),
    });

    const invoiceId = await captureInvoice(accountId, seats);
    compensations.push({
      name: "Refund invoice",
      undo: () => refundInvoice(accountId, invoiceId),
    });

    const entitlementId = await provisionSeats(accountId, seats);
    compensations.push({
      name: "Deprovision seats",
      undo: () => deprovisionSeats(accountId, entitlementId),
    });

    // Fire-and-forget — notifications don't need a compensation.
    await sendConfirmation(accountId, invoiceId, entitlementId);

    return { status: "completed" as const, accountId, invoiceId, entitlementId };
  } catch (error) {
    // Unwind in LIFO order. Each undo is itself a step → durable + retried.
    for (const comp of compensations.reverse()) {
      await comp.undo();
    }
    return {
      status: "rolled_back" as const,
      accountId,
      reason: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Forward steps — throw FatalError on permanent failure to skip retries
// and trigger compensation immediately.
async function reserveSeats(accountId: string, seats: number): Promise<string> {
  "use step";
  const res = await fetch("https://api.example.com/seats/reserve", {
    method: "POST",
    body: JSON.stringify({ accountId, seats }),
  });
  if (!res.ok) throw new FatalError("Seat reservation failed");
  const { reservationId } = await res.json();
  return reservationId;
}

async function captureInvoice(accountId: string, seats: number): Promise<string> {
  "use step";
  const res = await fetch("https://api.example.com/invoices", {
    method: "POST",
    body: JSON.stringify({ accountId, seats }),
  });
  if (!res.ok) throw new FatalError("Invoice capture failed");
  const { invoiceId } = await res.json();
  return invoiceId;
}

async function provisionSeats(accountId: string, seats: number): Promise<string> {
  "use step";
  const res = await fetch("https://api.example.com/entitlements", {
    method: "POST",
    body: JSON.stringify({ accountId, seats }),
  });
  if (!res.ok) throw new FatalError("Provisioning failed");
  const { entitlementId } = await res.json();
  return entitlementId;
}

async function sendConfirmation(
  accountId: string,
  invoiceId: string,
  entitlementId: string,
): Promise<void> {
  "use step";
  await fetch("https://api.example.com/notifications", {
    method: "POST",
    body: JSON.stringify({ accountId, invoiceId, entitlementId, template: "upgrade-complete" }),
  });
}

// Compensation steps — idempotent. Safe to call again if retried.
async function releaseSeats(accountId: string, reservationId: string): Promise<void> {
  "use step";
  await fetch("https://api.example.com/seats/release", {
    method: "POST",
    body: JSON.stringify({ accountId, reservationId }),
  });
}

async function refundInvoice(accountId: string, invoiceId: string): Promise<void> {
  "use step";
  await fetch(\`https://api.example.com/invoices/\${invoiceId}/refund\`, {
    method: "POST",
    body: JSON.stringify({ accountId }),
  });
}

async function deprovisionSeats(accountId: string, entitlementId: string): Promise<void> {
  "use step";
  await fetch(\`https://api.example.com/entitlements/\${entitlementId}\`, {
    method: "DELETE",
    body: JSON.stringify({ accountId }),
  });
}
`;

export const sagaStartRouteSource = `import { start } from "workflow/api";
import { NextResponse } from "next/server";
import { subscriptionUpgradeSaga } from "@/workflows/saga";

// POST /api/saga { accountId, seats }
export async function POST(request: Request) {
  const { accountId, seats } = await request.json();
  if (!accountId || typeof seats !== "number") {
    return NextResponse.json(
      { error: "accountId and seats are required" },
      { status: 400 },
    );
  }

  const run = await start(subscriptionUpgradeSaga, [accountId, seats]);
  return NextResponse.json({ runId: run.runId });
}
`;
