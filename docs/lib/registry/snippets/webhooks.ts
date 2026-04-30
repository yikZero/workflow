/**
 * Source snippets for the Webhooks & External Callbacks registry entry.
 *
 * createWebhook() returns a URL the workflow can await. The workflow loops
 * over incoming requests, processes each in a step, and responds inline.
 * Bonus: async-request-reply variant that submits to a vendor and races
 * the callback against a deadline.
 */

export const webhooksWorkflowSource = `import {
  createWebhook,
  sleep,
  FatalError,
  type RequestWithResponse,
} from "workflow";

// PATTERN 1 — Long-running webhook listener (Stripe-style).
// Workflow suspends with zero cost, resumes on each incoming request,
// and exits when a terminal event arrives.
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

// PATTERN 2 — Async request-reply with deadline. Submit to a vendor,
// pass it our webhook URL for the callback, race the callback against
// a 30-second budget.
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
