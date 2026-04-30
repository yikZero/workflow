/**
 * Source snippets for the Rate Limiting registry entry.
 *
 * Throw RetryableError with a Retry-After value and the workflow runtime
 * reschedules the step automatically — no manual sleep-retry loops. Includes
 * exponential-backoff variant via getStepMetadata().
 */

export const rateLimitingWorkflowSource = `import { RetryableError, getStepMetadata } from "workflow";

export async function syncContact(contactId: string) {
  "use workflow";

  const contact = await fetchFromCrm(contactId);
  await upsertToWarehouse(contactId, contact);

  return { contactId, status: "synced" as const };
}

// 429 — read Retry-After and let the runtime reschedule us.
async function fetchFromCrm(contactId: string): Promise<unknown> {
  "use step";

  const res = await fetch(\`https://crm.example.com/contacts/\${contactId}\`);

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new RetryableError("Rate limited by CRM", {
      retryAfter: retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : "1m",
    });
  }

  if (!res.ok) {
    throw new Error(\`CRM returned \${res.status}\`);
  }

  return res.json();
}

// 5xx + 429 — exponential backoff using the current attempt number.
async function upsertToWarehouse(
  contactId: string,
  contact: unknown,
): Promise<void> {
  "use step";

  const { attempt } = getStepMetadata();
  const res = await fetch(\`https://warehouse.example.com/contacts/\${contactId}\`, {
    method: "PUT",
    body: JSON.stringify(contact),
  });

  if (res.status === 429 || res.status >= 500) {
    throw new RetryableError(\`Warehouse error \${res.status}\`, {
      retryAfter: attempt ** 2 * 1000, // 1s, 4s, 9s...
    });
  }

  if (!res.ok) {
    throw new Error(\`Warehouse returned \${res.status}\`);
  }
}

// Allow more retries than the default of 3 for known-flaky endpoints.
upsertToWarehouse.maxRetries = 10;
`;

export const rateLimitingStartRouteSource = `import { start } from "workflow/api";
import { NextResponse } from "next/server";
import { syncContact } from "@/workflows/rate-limiting";

// POST /api/rate-limiting { contactId }
export async function POST(request: Request) {
  const { contactId } = await request.json();
  if (!contactId) {
    return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  }

  const run = await start(syncContact, [contactId]);
  return NextResponse.json({ runId: run.runId });
}
`;
