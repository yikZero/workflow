/**
 * Source snippets for the Child Workflows registry entry.
 *
 * Spawn-and-poll pattern for orchestrating many independent workflow runs
 * from a parent — each child has its own runId, event log, and retry
 * boundary, so a failing child never takes down siblings or the parent.
 * Ships parent + child + spawn step + polling step + collection step.
 */

export const childWorkflowsWorkflowSource = `import { sleep } from "workflow";
import { getRun, start } from "workflow/api";

const POLL_INTERVAL = "30s";
// 60 minutes worth of poll iterations at the configured interval.
const MAX_POLL_ITERATIONS = 120;
// Spawn in chunks so a single step doesn't time out on huge batches.
const SPAWN_CHUNK_SIZE = 25;

// CHILD — one independent unit of work. Replace the steps with real logic.
export async function processDocument(documentId: string) {
  "use workflow";

  const content = await fetchDocument(documentId);
  const analysis = await analyzeContent(content);
  const summary = await generateSummary(analysis);

  return { documentId, summary };
}

// PARENT — orchestrates many children, polls them, collects their output.
export async function processDocumentBatch(documentIds: string[]) {
  "use workflow";

  // Spawn in chunks. Each chunk is its own step → durable + retried.
  const allRunIds: string[] = [];
  for (let i = 0; i < documentIds.length; i += SPAWN_CHUNK_SIZE) {
    const chunk = documentIds.slice(i, i + SPAWN_CHUNK_SIZE);
    const runIds = await spawnChunk(chunk);
    allRunIds.push(...runIds);
  }

  // Poll until every child has reached a terminal status.
  await pollUntilComplete(allRunIds);

  // Collect return values from each child.
  const results = await collectResults(allRunIds);

  return { processed: results.length, results };
}

// Polling loop — lives inside the workflow so sleeps replay durably.
async function pollUntilComplete(runIds: string[]): Promise<void> {
  for (let iteration = 0; iteration < MAX_POLL_ITERATIONS; iteration++) {
    const status = await checkStatuses(runIds);

    if (status.running === 0) {
      if (status.failed > 0) {
        throw new Error(
          \`\${status.failed} of \${runIds.length} children failed\`,
        );
      }
      return;
    }

    await sleep(POLL_INTERVAL);
  }

  throw new Error("Timed out waiting for children to complete");
}

// start() must be called from a step, not from a workflow function.
// deploymentId: "latest" makes children pick up future deployments.
async function spawnChunk(documentIds: string[]): Promise<string[]> {
  "use step";

  const runIds: string[] = [];
  for (const docId of documentIds) {
    const run = await start(processDocument, [docId], { deploymentId: "latest" });
    runIds.push(run.runId);
  }
  return runIds;
}

// getRun() also must be called from a step.
async function checkStatuses(
  runIds: string[],
): Promise<{ running: number; completed: number; failed: number }> {
  "use step";

  let running = 0;
  let completed = 0;
  let failed = 0;

  for (const runId of runIds) {
    const status = await getRun(runId).status;
    if (status === "completed") completed++;
    else if (status === "failed" || status === "cancelled") failed++;
    else running++;
  }

  return { running, completed, failed };
}

async function collectResults(
  runIds: string[],
): Promise<Array<{ documentId: string; summary: string }>> {
  "use step";

  const results: Array<{ documentId: string; summary: string }> = [];
  for (const runId of runIds) {
    const value = (await getRun(runId).returnValue) as {
      documentId: string;
      summary: string;
    };
    results.push(value);
  }
  return results;
}

// Replace the step bodies below with your real per-document work.
async function fetchDocument(documentId: string): Promise<string> {
  "use step";
  const res = await fetch(\`https://docs.example.com/api/\${documentId}\`);
  return res.text();
}

async function analyzeContent(content: string): Promise<string> {
  "use step";
  return \`analysis of \${content.length} chars\`;
}

async function generateSummary(analysis: string): Promise<string> {
  "use step";
  return \`Summary: \${analysis}\`;
}
`;

export const childWorkflowsWorkflowInstallSource = `/**
 * Child Workflows — spawn-and-poll for independent parallel runs.
 *
 * THE PATTERN:
 *   1. The parent spawns child workflows in chunks (from a "use step") so
 *      each chunk is its own durable checkpoint.
 *   2. Each child is an independent workflow run with its own runId, event
 *      log, and retry boundary — a failing child never affects siblings.
 *   3. The parent polls children via a sleep + checkStatuses loop. The
 *      polling lives inside the workflow so each sleep() is durable.
 *   4. After all children complete, the parent collects their return values.
 *
 * USEFUL WHEN:
 *   - Processing hundreds of independent items (documents, users, records)
 *     in parallel with isolated failure handling per item.
 *   - You need per-item run IDs for individual observability and cancellation.
 *   - Children have long runtimes and you want the parent to survive restarts
 *     while waiting for them.
 *
 * TO ADAPT THIS TO YOUR USE CASE:
 *   - Replace processDocument with your child workflow function.
 *   - Replace the fetchDocument / analyzeContent / generateSummary steps
 *     with your real per-item work.
 *   - Tune SPAWN_CHUNK_SIZE: smaller = more durable checkpoints on spawn.
 *   - Tune POLL_INTERVAL and MAX_POLL_ITERATIONS to match expected duration.
 *   - Adjust the collectResults return type to match your child's return value.
 *   - { deploymentId: "latest" } on start() lets children pick up future
 *     code deployments automatically during long-running parent runs.
 *
 * DOCS: https://workflow-sdk.dev/patterns/child-workflows
 */
import { sleep } from "workflow";
import { getRun, start } from "workflow/api";

const POLL_INTERVAL = "30s";
// 60 minutes worth of poll iterations at the configured interval.
const MAX_POLL_ITERATIONS = 120;
// Spawn in chunks so a single step doesn't time out on huge batches.
const SPAWN_CHUNK_SIZE = 25;

// CHILD — one independent unit of work. Replace the steps with real logic.
export async function processDocument(documentId: string) {
  "use workflow";

  const content = await fetchDocument(documentId);
  const analysis = await analyzeContent(content);
  const summary = await generateSummary(analysis);

  return { documentId, summary };
}

// PARENT — orchestrates many children, polls them, collects their output.
export async function processDocumentBatch(documentIds: string[]) {
  "use workflow";

  // Spawn in chunks. Each chunk is its own step → durable + retried.
  const allRunIds: string[] = [];
  for (let i = 0; i < documentIds.length; i += SPAWN_CHUNK_SIZE) {
    const chunk = documentIds.slice(i, i + SPAWN_CHUNK_SIZE);
    const runIds = await spawnChunk(chunk);
    allRunIds.push(...runIds);
  }

  await pollUntilComplete(allRunIds);
  const results = await collectResults(allRunIds);

  return { processed: results.length, results };
}

// Polling loop — lives in the workflow so sleep() replays durably.
async function pollUntilComplete(runIds: string[]): Promise<void> {
  for (let iteration = 0; iteration < MAX_POLL_ITERATIONS; iteration++) {
    const status = await checkStatuses(runIds);

    if (status.running === 0) {
      if (status.failed > 0) {
        throw new Error(\`\${status.failed} of \${runIds.length} children failed\`);
      }
      return;
    }

    await sleep(POLL_INTERVAL);
  }

  throw new Error("Timed out waiting for children to complete");
}

// start() must be called from a step, not directly from a workflow function.
// deploymentId: "latest" makes children pick up future deployments automatically.
async function spawnChunk(documentIds: string[]): Promise<string[]> {
  "use step";

  const runIds: string[] = [];
  for (const docId of documentIds) {
    const run = await start(processDocument, [docId], { deploymentId: "latest" });
    runIds.push(run.runId);
  }
  return runIds;
}

// getRun() also must be called from a step.
async function checkStatuses(
  runIds: string[],
): Promise<{ running: number; completed: number; failed: number }> {
  "use step";

  let running = 0;
  let completed = 0;
  let failed = 0;

  for (const runId of runIds) {
    const status = await getRun(runId).status;
    if (status === "completed") completed++;
    else if (status === "failed" || status === "cancelled") failed++;
    else running++;
  }

  return { running, completed, failed };
}

async function collectResults(
  runIds: string[],
): Promise<Array<{ documentId: string; summary: string }>> {
  "use step";

  const results: Array<{ documentId: string; summary: string }> = [];
  for (const runId of runIds) {
    const value = (await getRun(runId).returnValue) as {
      documentId: string;
      summary: string;
    };
    results.push(value);
  }
  return results;
}

// Replace the step bodies below with your real per-document work.
async function fetchDocument(documentId: string): Promise<string> {
  "use step";
  const res = await fetch(\`https://docs.example.com/api/\${documentId}\`);
  return res.text();
}

async function analyzeContent(content: string): Promise<string> {
  "use step";
  return \`analysis of \${content.length} chars\`;
}

async function generateSummary(analysis: string): Promise<string> {
  "use step";
  return \`Summary: \${analysis}\`;
}
`;

export const childWorkflowsStartRouteSource = `import { start } from "workflow/api";
import { NextResponse } from "next/server";
import { processDocumentBatch } from "@/app/workflows/child-workflows";

// POST /api/child-workflows { documentIds: string[] }
export async function POST(request: Request) {
  const { documentIds } = (await request.json()) as { documentIds: string[] };

  if (!Array.isArray(documentIds) || documentIds.length === 0) {
    return NextResponse.json(
      { error: "documentIds must be a non-empty array" },
      { status: 400 },
    );
  }

  const run = await start(processDocumentBatch, [documentIds]);
  return NextResponse.json({ runId: run.runId });
}
`;
