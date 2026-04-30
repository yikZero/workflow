/**
 * Source snippets for the Timeouts registry entry.
 *
 * Bound the time any step, hook, or webhook can take by racing it against
 * a durable sleep. Discriminated sentinel values keep TypeScript narrow on
 * both branches. Two flavors: hard timeout (throw) and soft timeout
 * (fallback value).
 */

export const timeoutsWorkflowSource = `import { sleep, createWebhook } from "workflow";

const TIMEOUT = Symbol("timeout");

// HARD TIMEOUT — throw if the work doesn't finish in time.
export async function processWithTimeout(data: string) {
  "use workflow";

  const result = await Promise.race([
    processData(data),
    sleep("30s").then(() => TIMEOUT as typeof TIMEOUT),
  ]);

  if (result === TIMEOUT) {
    throw new Error("Processing timed out after 30 seconds");
  }

  return result;
}

// SOFT TIMEOUT — fall back to a cached value if the deadline fires first.
export async function fetchWithFallback(key: string, fallback: string) {
  "use workflow";

  const result = await Promise.race([
    fetchSlow(key),
    sleep("3s").then(() => TIMEOUT as typeof TIMEOUT),
  ]);

  return result === TIMEOUT ? fallback : result;
}

// WEBHOOK + DEADLINE — same pattern, racing an external callback against
// a 7-day sleep so workflows never hang forever on a missing event.
export async function waitForApproval(requestId: string) {
  "use workflow";

  const webhook = createWebhook<{ approved: boolean }>();
  await sendApprovalRequest(requestId, webhook.url);

  const result = await Promise.race([
    webhook.then((req) => req.json()),
    sleep("7 days").then(() => ({ timedOut: true } as const)),
  ]);

  if ("timedOut" in result) {
    throw new Error("Approval request expired after 7 days");
  }

  return result.approved;
}

async function processData(data: string): Promise<string> {
  "use step";
  // Replace with real work. Note: the LOSER of Promise.race keeps running
  // — the workflow ignores its result, but side effects still happen.
  // Use Distributed Abort Controller for hard cross-process cancellation.
  return data.toUpperCase();
}

async function fetchSlow(key: string): Promise<string> {
  "use step";
  const res = await fetch(\`https://api.example.com/slow/\${key}\`);
  return res.text();
}

async function sendApprovalRequest(
  requestId: string,
  webhookUrl: string,
): Promise<void> {
  "use step";
  await fetch("https://api.example.com/approvals", {
    method: "POST",
    body: JSON.stringify({ requestId, webhookUrl }),
  });
}
`;

export const timeoutsStartRouteSource = `import { start } from "workflow/api";
import { NextResponse } from "next/server";
import { processWithTimeout } from "@/workflows/timeouts";

// POST /api/timeouts { data }
export async function POST(request: Request) {
  const { data } = await request.json();
  if (typeof data !== "string") {
    return NextResponse.json({ error: "data must be a string" }, { status: 400 });
  }

  const run = await start(processWithTimeout, [data]);
  return NextResponse.json({ runId: run.runId });
}
`;
