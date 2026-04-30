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

export const batchingStartRouteSource = `import { start } from "workflow/api";
import { NextResponse } from "next/server";
import { batchImport, type ImportRecord } from "@/workflows/batching";

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
