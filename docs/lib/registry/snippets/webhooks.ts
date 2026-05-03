/**
 * Source snippets for the Webhooks & External Callbacks registry entry.
 *
 * createWebhook() returns a URL the workflow can await. The workflow loops
 * over incoming requests, processes each in a step, and responds inline.
 * Bonus: async-request-reply variant that submits to a vendor and races
 * the callback against a deadline.
 */

// Pattern 1 — Long-running webhook listener (Stripe-style event ledger).
export const webhooksEventListenerSource = `import {
  createWebhook,
  type RequestWithResponse,
} from "workflow";

export async function paymentWebhook(orderId: string) {
  "use workflow";

  const webhook = createWebhook({ respondWith: "manual" });
  // webhook.url is the URL to register with the external service.

  const ledger: { type: string; at: string }[] = [];

  for await (const request of webhook) {
    const entry = await processEvent(request);
    ledger.push({ ...entry, at: new Date().toISOString() });

    if (entry.type === "payment.succeeded" || entry.type === "refund.created") {
      break;
    }
  }

  return { orderId, webhookUrl: webhook.url, ledger, status: "settled" as const };
}

async function processEvent(
  request: RequestWithResponse,
): Promise<{ type: string }> {
  "use step";
  const body = await request.json().catch(() => ({}));
  const type = (body?.type as string) ?? "unknown";

  if (type === "payment.succeeded") {
    await request.respondWith(Response.json({ ack: true, action: "captured" }));
  } else if (type === "payment.failed") {
    await request.respondWith(Response.json({ ack: true, action: "flagged" }));
  } else {
    await request.respondWith(Response.json({ ack: true, action: "ignored" }));
  }

  return { type };
}
`;

// Pattern 2 — Async request-reply with deadline.
export const webhooksRequestReplySource = `import {
  createWebhook,
  sleep,
  FatalError,
  type RequestWithResponse,
} from "workflow";

export async function asyncVerification(documentId: string) {
  "use workflow";

  const webhook = createWebhook({ respondWith: "manual" });
  await submitToVendor(documentId, webhook.url);

  const result = await Promise.race([
    (async () => {
      for await (const request of webhook) {
        return await processCallback(request);
      }
      throw new FatalError("Webhook closed without callback");
    })(),
    sleep("30s").then(() => ({ status: "timed_out" as const })),
  ]);

  return { documentId, ...result };
}

async function submitToVendor(
  documentId: string,
  callbackUrl: string,
): Promise<void> {
  "use step";
  await fetch("https://vendor.example.com/verify", {
    method: "POST",
    body: JSON.stringify({ documentId, callbackUrl }),
  });
}

async function processCallback(
  request: RequestWithResponse,
): Promise<{ status: string; details: string }> {
  "use step";
  const body = await request.json().catch(() => ({}));
  await request.respondWith(Response.json({ ack: true }));
  return {
    status: body.approved ? "verified" : "rejected",
    details: body.details ?? body.reason ?? "",
  };
}
`;

// ─── Event Listener install code ──────────────────────────────────────────────
export const webhooksEventListenerInstallSource = `/**
 * Webhooks — Event Listener pattern (long-running webhook ledger).
 *
 * THE PATTERN:
 *   1. createWebhook({ respondWith: "manual" }) returns a durable URL and an
 *      async iterator. Register the URL with the external service once.
 *   2. \`for await (const request of webhook)\` yields incoming HTTP requests
 *      into the workflow's event loop — each iteration is a durable step.
 *   3. Process and respond to each webhook inside processEvent ("use step")
 *      so the response is durable and the handler retries on crash.
 *   4. \`break\` the loop to terminate the workflow when a terminal event
 *      arrives (payment.succeeded, refund.created, etc.).
 *
 * USEFUL WHEN:
 *   - You need to receive and process a sequence of webhook events for a
 *     single entity (order, payment, document) over time.
 *   - Each event must be acknowledged individually to the provider.
 *   - The workflow must survive restarts without missing or duplicating events.
 *
 * TO ADAPT THIS TO YOUR USE CASE:
 *   - Register webhook.url with your provider (Stripe, GitHub, Twilio…)
 *     after starting the workflow — it's stable for the run's lifetime.
 *   - Replace processEvent with your domain logic. Return a type discriminant
 *     so the loop knows when to break.
 *   - Add more terminal event types to the break condition as needed.
 *   - For a single callback (not a sequence), use the Request-Reply pattern.
 *
 * DOCS: https://workflow-sdk.dev/patterns/webhooks
 */
import {
  createWebhook,
  type RequestWithResponse,
} from "workflow";

export async function paymentWebhook(orderId: string) {
  "use workflow";

  // createWebhook returns a stable URL and an async iterator over requests.
  const webhook = createWebhook({ respondWith: "manual" });
  // Register webhook.url with your provider — it's valid for this run's lifetime.

  const ledger: { type: string; at: string }[] = [];

  for await (const request of webhook) {
    const entry = await processEvent(request);
    ledger.push({ ...entry, at: new Date().toISOString() });

    // Break on terminal events to end the workflow.
    if (entry.type === "payment.succeeded" || entry.type === "refund.created") {
      break;
    }
  }

  return { orderId, webhookUrl: webhook.url, ledger, status: "settled" as const };
}

async function processEvent(
  request: RequestWithResponse,
): Promise<{ type: string }> {
  "use step";
  const body = await request.json().catch(() => ({}));
  const type = (body?.type as string) ?? "unknown";

  if (type === "payment.succeeded") {
    await request.respondWith(Response.json({ ack: true, action: "captured" }));
  } else if (type === "payment.failed") {
    await request.respondWith(Response.json({ ack: true, action: "flagged" }));
  } else {
    await request.respondWith(Response.json({ ack: true, action: "ignored" }));
  }

  return { type };
}
`;

// ─── Request-Reply install code ────────────────────────────────────────────────
export const webhooksRequestReplyInstallSource = `/**
 * Webhooks — Async Request-Reply pattern (single callback with deadline).
 *
 * THE PATTERN:
 *   1. createWebhook() generates a one-time callback URL.
 *   2. Submit the URL to an external vendor that processes asynchronously
 *      (document verification, identity check, payment authorization…).
 *   3. Race the webhook callback against a sleep() deadline so the workflow
 *      never waits forever for an external service that never responds.
 *   4. Process the callback in a "use step" function so the response is
 *      durable and the handler retries on crash.
 *
 * USEFUL WHEN:
 *   - You call an external API that responds asynchronously via a callback URL.
 *   - You need a hard deadline after which the workflow times out gracefully.
 *   - The vendor callback is a one-shot event (not a sequence).
 *
 * TO ADAPT THIS TO YOUR USE CASE:
 *   - Replace submitToVendor with your external API call.
 *   - Replace processCallback with your domain logic for the callback.
 *   - Tune the sleep("30s") deadline to match your vendor's SLA.
 *   - For sequences of events, use the Event Listener pattern instead.
 *
 * DOCS: https://workflow-sdk.dev/patterns/webhooks
 */
import {
  createWebhook,
  sleep,
  FatalError,
  type RequestWithResponse,
} from "workflow";

export async function asyncVerification(documentId: string) {
  "use workflow";

  const webhook = createWebhook({ respondWith: "manual" });
  await submitToVendor(documentId, webhook.url);

  const result = await Promise.race([
    (async () => {
      for await (const request of webhook) {
        return await processCallback(request);
      }
      throw new FatalError("Webhook closed without callback");
    })(),
    // Deadline: return a timed_out sentinel after 30s.
    sleep("30s").then(() => ({ status: "timed_out" as const })),
  ]);

  return { documentId, ...result };
}

async function submitToVendor(
  documentId: string,
  callbackUrl: string,
): Promise<void> {
  "use step";
  await fetch("https://vendor.example.com/verify", {
    method: "POST",
    body: JSON.stringify({ documentId, callbackUrl }),
  });
}

async function processCallback(
  request: RequestWithResponse,
): Promise<{ status: string; details: string }> {
  "use step";
  const body = await request.json().catch(() => ({}));
  await request.respondWith(Response.json({ ack: true }));
  return {
    status: body.approved ? "verified" : "rejected",
    details: body.details ?? body.reason ?? "",
  };
}
`;

export const webhooksStartRouteSource = `import { start, getRun } from "workflow/api";
import { NextResponse } from "next/server";
import { paymentWebhook } from "@/workflows/webhooks";

// POST /api/webhooks { orderId }
// Returns the auto-generated webhook URL — register it with the external service.
export async function POST(request: Request) {
  const { orderId } = await request.json();
  if (!orderId) {
    return NextResponse.json({ error: "orderId is required" }, { status: 400 });
  }

  const run = await start(paymentWebhook, [orderId]);

  // Read the workflow's return value once to surface webhook.url upstream.
  // For long-lived webhooks, prefer streaming or a separate "/url/:runId" route.
  return NextResponse.json({
    runId: run.runId,
    note: "The workflow exposes webhook.url in its return value once settled.",
  });
}
`;
