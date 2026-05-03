/**
 * Source snippets for the Batching registry entry.
 *
 * Process a large list of records in fixed-size parallel batches with
 * failure isolation between groups. Each batch runs concurrently via
 * Promise.allSettled; sleep() between batches paces requests against
 * downstream rate limits. Drop-in starter for bulk imports.
 */

export const batchingWorkflowSource = `import { sleep } from "workflow";

export interface ImportRecord {
  name: string;
  email: string;
  role: string;
}

export async function batchImport(records: ImportRecord[], batchSize = 10) {
  "use workflow";

  let totalSucceeded = 0;
  let totalFailed = 0;
  const failures: Array<{ email: string; reason: string }> = [];

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    // Failures inside the batch are isolated — Promise.allSettled never throws.
    const outcomes = await Promise.allSettled(
      batch.map((record) => processRecord(record)),
    );

    for (let j = 0; j < outcomes.length; j++) {
      const outcome = outcomes[j];
      if (outcome.status === "fulfilled") {
        totalSucceeded++;
      } else {
        totalFailed++;
        failures.push({
          email: batch[j].email,
          reason:
            outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason),
        });
      }
    }

    // Pace between batches so downstream APIs aren't overwhelmed.
    // Tune (or remove) to match your provider's rate limits.
    if (i + batchSize < records.length) {
      await sleep("1s");
    }
  }

  return {
    total: records.length,
    succeeded: totalSucceeded,
    failed: totalFailed,
    failures,
  };
}

// Each record runs in its own step → durable, retried up to 3x by default.
async function processRecord(record: ImportRecord): Promise<string> {
  "use step";
  const res = await fetch("https://api.example.com/contacts", {
    method: "POST",
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    throw new Error(\`Failed to import \${record.email} (\${res.status})\`);
  }
  const { id } = await res.json();
  return id;
}
`;

export const batchingWorkflowInstallSource = `/**
 * Batching — process large lists in parallel chunks with failure isolation.
 *
 * THE PATTERN:
 *   1. Slice the input array into fixed-size batches (default: 10).
 *   2. Process each batch with Promise.allSettled() — failures are isolated
 *      per record; one bad record never aborts the whole batch.
 *   3. sleep() between batches paces requests against downstream rate limits.
 *   4. Each individual record runs in a "use step" — durable, retried 3x,
 *      and never re-executed on replay if it already completed.
 *
 * USEFUL WHEN:
 *   - Importing thousands of contacts, products, or orders from a CSV.
 *   - Sending bulk emails or notifications in controlled bursts.
 *   - Syncing data to a downstream API that has per-minute rate limits.
 *   - Any "fan-out over a list" task where partial failures are acceptable.
 *
 * TO ADAPT THIS TO YOUR USE CASE:
 *   - Replace the ImportRecord interface with your record shape.
 *   - Replace the processRecord step body with your real API call.
 *   - Tune batchSize: smaller = more durable checkpoints, larger = faster.
 *   - Tune the sleep("1s") between batches to match your API's rate limit.
 *   - Change processRecord.maxRetries (default 3) for flaky endpoints.
 *   - Collect failure details from the returned failures array for reporting.
 *
 * DOCS: https://workflow-sdk.dev/patterns/batching
 */
import { sleep } from "workflow";

export interface ImportRecord {
  name: string;
  email: string;
  role: string;
}

export async function batchImport(records: ImportRecord[], batchSize = 10) {
  "use workflow";

  let totalSucceeded = 0;
  let totalFailed = 0;
  const failures: Array<{ email: string; reason: string }> = [];

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    // allSettled: failures inside a batch are isolated — never throws.
    const outcomes = await Promise.allSettled(
      batch.map((record) => processRecord(record)),
    );

    for (let j = 0; j < outcomes.length; j++) {
      const outcome = outcomes[j];
      if (outcome.status === "fulfilled") {
        totalSucceeded++;
      } else {
        totalFailed++;
        failures.push({
          email: batch[j].email,
          reason:
            outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason),
        });
      }
    }

    // Pace between batches — tune or remove to match your provider's limits.
    if (i + batchSize < records.length) {
      await sleep("1s");
    }
  }

  return { total: records.length, succeeded: totalSucceeded, failed: totalFailed, failures };
}

// Each record runs in its own step → durable, retried up to 3x by default.
// Throw an Error (or RetryableError) to trigger a retry; FatalError to skip.
async function processRecord(record: ImportRecord): Promise<string> {
  "use step";
  const res = await fetch("https://api.example.com/contacts", {
    method: "POST",
    body: JSON.stringify(record),
  });
  if (!res.ok) {
    throw new Error(\`Failed to import \${record.email} (\${res.status})\`);
  }
  const { id } = await res.json();
  return id;
}
`;

export const batchingStartRouteSource = `import { start } from "workflow/api";
import { NextResponse } from "next/server";
import { batchImport, type ImportRecord } from "@/app/workflows/batching";

// POST /api/batching { records: ImportRecord[], batchSize?: number }
export async function POST(request: Request) {
  const { records, batchSize } = (await request.json()) as {
    records: ImportRecord[];
    batchSize?: number;
  };

  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json(
      { error: "records must be a non-empty array" },
      { status: 400 },
    );
  }

  const run = await start(batchImport, [records, batchSize ?? 10]);
  return NextResponse.json({ runId: run.runId });
}
`;
