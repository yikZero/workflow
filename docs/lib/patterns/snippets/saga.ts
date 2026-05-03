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

export const sagaWorkflowInstallSource = `/**
 * Saga (Transactions & Rollbacks) — multi-step transaction with automatic
 * compensation on failure.
 *
 * THE PATTERN:
 *   1. Each forward step pushes a matching undo function onto a compensation
 *      stack before executing — so the stack is always in sync with what
 *      has actually succeeded.
 *   2. On any error, the catch block unwinds the stack in LIFO order,
 *      calling each undo step to restore consistency.
 *   3. Compensation steps are "use step" functions — durable and retried —
 *      so a mid-rollback crash doesn't leave data inconsistent.
 *   4. FatalError skips the default 3x retry and triggers rollback immediately
 *      for errors that can't benefit from a retry (e.g. "card declined").
 *
 * USEFUL WHEN:
 *   - A multi-step flow (reserve → charge → provision → notify) must be
 *     consistent: if any step fails, all prior steps must be undone.
 *   - You can't use a database transaction across multiple external services.
 *   - You need an audit trail of what was attempted and what was rolled back.
 *
 * TO ADAPT THIS TO YOUR USE CASE:
 *   - Replace reserveSeats / captureInvoice / provisionSeats with your
 *     forward steps. Each must have a matching compensation pushed before it.
 *   - Make all compensation steps idempotent — they may be called multiple
 *     times if the workflow restarts mid-rollback.
 *   - Use FatalError on permanent failures (auth errors, validation) to skip
 *     retries and trigger the rollback immediately.
 *   - sendConfirmation is fire-and-forget (no compensation) — OK for
 *     notifications where duplication is harmless.
 *
 * DOCS: https://workflow-sdk.dev/patterns/saga
 */
import { FatalError } from "workflow";

export async function subscriptionUpgradeSaga(accountId: string, seats: number) {
  "use workflow";

  // Stack grows as steps succeed; unwound in LIFO order on failure.
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

// Forward steps — throw FatalError for permanent failures to skip retries
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

// Compensation steps — MUST be idempotent. May be called again if retried.
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
import { subscriptionUpgradeSaga } from "@/app/workflows/saga";

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
