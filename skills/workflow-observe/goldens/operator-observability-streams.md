# Golden Scenario: Operator Observability Streams

## User Prompt

```
/workflow-observe Stream operator progress, namespaced logs, and terminal status for a long-running backfill workflow.
```

## Scenario

A data pipeline workflow ingests CSV files, validates rows, transforms data, and loads into a data warehouse. Operators need real-time visibility into progress (rows processed, validation errors, load status) via namespaced streams, and must be able to diagnose failures from structured logs without accessing the runtime directly. The workflow must emit terminal signals on every exit path so operators never have to guess whether it is still running.

## Context Capture

The scenario skill checks for `.workflow.md` first. In this example it does not exist, so the focused observability-specific interview runs:

| Question | Expected Answer |
|----------|----------------|
| Operator audience | Ops dashboard and CLI monitoring tool; both consume structured JSON streams |
| Progress granularity | Rows processed vs total, stage transitions (validate → transform → load), percentage complete |
| Stream namespaces | Three channels: `progress` (row counts, percentage), `errors` (validation failures with row numbers), `status` (terminal signals) |
| Terminal signals | Success: `workflow.completed` with total rows and duration. Failure: `workflow.failed` with error context and last successful stage. |
| Structured log format | JSON with `event`, `timestamp`, and `data` fields |
| Failure diagnostics | On step failure: include step name, input row range, error message, and retry count in the error stream |

The captured context is saved to `.workflow.md` with sections: Project Context, Business Rules, External Systems, Failure Expectations, Observability Needs, Approved Patterns, Open Questions.

## What the Scenario Skill Should Catch

### Phase 2 — Traps Flagged

1. **Stream I/O placement** — `getWritable()` may be called in workflow context, but all `write()` calls must happen inside `"use step"` functions. This is a hard runtime constraint that would cause silent failures if violated.
2. **Namespace separation** — Progress, error, and status events must use distinct stream namespaces. Mixing them in a single namespace forces operators to filter manually and breaks targeted subscriptions.
3. **Terminal signal coverage** — Every exit path (success, failure, partial success) must emit a terminal signal. A workflow that fails silently is invisible to operators.
4. **Self-describing progress events** — Each progress event must include cumulative totals (processed, total, remaining), not just deltas. Operators joining mid-stream cannot reconstruct state from deltas alone.

### Phase 3 — Failure Modes Decided

- `validateRows`: `FatalError` for malformed CSV (code/data bug, cannot recover). Emits validation errors to `errors` namespace before throwing.
- `transformData`: `RetryableError` with `maxRetries: 2` for transient transformation failures. Emits progress to `progress` namespace.
- `loadToWarehouse`: `RetryableError` with `maxRetries: 3` for transient warehouse connection failures. Emits row-level progress to `progress` namespace.
- `emitTerminalSignal`: Always executes — wraps the workflow in try/finally to guarantee terminal signal emission on every exit path.

## Expected Code Output

```typescript
"use workflow";

import { FatalError, RetryableError, getWritable } from "workflow";

const progressStream = getWritable("progress");
const errorStream = getWritable("errors");
const statusStream = getWritable("status");

const validateRows = async (batchId: string, rows: RawRow[]) => {
  "use step";
  const valid: ValidRow[] = [];
  const errors: ValidationError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const result = validateRow(rows[i]);
    if (result.ok) {
      valid.push(result.row);
    } else {
      errors.push({ row: i, error: result.error });
      errorStream.write(JSON.stringify({
        event: "validation.error",
        timestamp: new Date().toISOString(),
        data: { batchId, row: i, error: result.error },
      }));
    }
  }

  progressStream.write(JSON.stringify({
    event: "stage.completed",
    timestamp: new Date().toISOString(),
    data: { batchId, stage: "validate", validCount: valid.length, errorCount: errors.length, total: rows.length },
  }));

  if (valid.length === 0) {
    throw new FatalError(`Batch ${batchId}: all rows invalid`);
  }

  return { valid, errors };
};

const loadToWarehouse = async (batchId: string, rows: ValidRow[]) => {
  "use step";
  let loaded = 0;
  for (const chunk of chunkArray(rows, 100)) {
    await warehouse.upsert({ idempotencyKey: `load:${batchId}:${loaded}`, rows: chunk });
    loaded += chunk.length;

    progressStream.write(JSON.stringify({
      event: "load.progress",
      timestamp: new Date().toISOString(),
      data: { batchId, loaded, total: rows.length, remaining: rows.length - loaded },
    }));
  }

  return { loaded };
};

const emitTerminal = async (batchId: string, status: string, details: Record<string, unknown>) => {
  "use step";
  statusStream.write(JSON.stringify({
    event: status === "success" ? "workflow.completed" : "workflow.failed",
    timestamp: new Date().toISOString(),
    data: { batchId, status, ...details },
  }));
};

export default async function backfillPipeline(
  batchId: string,
  rows: RawRow[]
) {
  const startTime = Date.now();

  try {
    // Validate rows — streams errors to error namespace
    const { valid, errors } = await validateRows(batchId, rows);

    // Load to warehouse — streams progress to progress namespace
    const { loaded } = await loadToWarehouse(batchId, valid);

    // Terminal signal: success
    await emitTerminal(batchId, "success", {
      totalRows: rows.length,
      validRows: valid.length,
      loadedRows: loaded,
      validationErrors: errors.length,
      durationMs: Date.now() - startTime,
    });

    return { batchId, status: "completed", loaded };
  } catch (error) {
    // Terminal signal: failure
    await emitTerminal(batchId, "error", {
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startTime,
    });
    throw error;
  }
}
```

## Expected Test Output

```typescript
import { describe, it, expect } from "vitest";
import { start } from "workflow/api";
import backfillPipeline from "../workflows/backfill-pipeline";

describe("backfillPipeline observability", () => {
  it("emits progress events and terminal success signal", async () => {
    const run = await start(backfillPipeline, [
      "batch-001", [{ id: 1, data: "valid" }, { id: 2, data: "valid" }],
    ]);
    const result = await run.returnValue;
    expect(result).toEqual({
      batchId: "batch-001",
      status: "completed",
      loaded: 2,
    });
    // Verify progress stream contains stage.completed and load.progress events
    // Verify status stream contains workflow.completed terminal signal
  });

  it("streams validation errors to error namespace", async () => {
    const run = await start(backfillPipeline, [
      "batch-002", [{ id: 1, data: "valid" }, { id: 2, data: null }],
    ]);
    const result = await run.returnValue;
    // Verify error stream contains validation.error for row 1
    // Verify progress stream shows validCount: 1, errorCount: 1
  });

  it("emits terminal failure signal when all rows invalid", async () => {
    const run = await start(backfillPipeline, [
      "batch-003", [{ id: 1, data: null }],
    ]);
    await expect(run.returnValue).rejects.toThrow(FatalError);
    // Verify status stream contains workflow.failed terminal signal
    // Verify error stream contains validation errors
  });
});
```

## Verification Artifact

```json
{
  "contractVersion": "1",
  "blueprintName": "backfill-pipeline",
  "files": [
    { "kind": "workflow", "path": "workflows/backfill-pipeline.ts" },
    { "kind": "test", "path": "workflows/backfill-pipeline.integration.test.ts" }
  ],
  "testMatrix": [
    {
      "name": "happy-path-with-stream-verification",
      "helpers": [],
      "expects": "Pipeline completes with progress events and workflow.completed terminal signal"
    },
    {
      "name": "validation-errors-streamed",
      "helpers": [],
      "expects": "Validation errors appear in error namespace, progress reflects valid/invalid counts"
    },
    {
      "name": "terminal-failure-signal",
      "helpers": [],
      "expects": "Fatal validation failure emits workflow.failed terminal signal before throwing"
    }
  ],
  "runtimeCommands": [
    { "name": "typecheck", "command": "pnpm typecheck", "expects": "No TypeScript errors" },
    { "name": "test", "command": "pnpm test", "expects": "All repository tests pass" },
    { "name": "focused-workflow-test", "command": "pnpm vitest run workflows/backfill-pipeline.integration.test.ts", "expects": "backfill-pipeline integration tests pass" }
  ],
  "implementationNotes": [
    "Invariant: Stream writes happen only inside step functions, never in workflow context",
    "Invariant: Progress, error, and status use separate stream namespaces",
    "Invariant: Every exit path emits a terminal signal to the status namespace",
    "Invariant: Progress events include cumulative totals, not deltas",
    "Operator signal: Log stage.completed with valid/error counts after validation",
    "Operator signal: Log load.progress with loaded/total/remaining during warehouse load",
    "Operator signal: Log workflow.completed or workflow.failed as terminal signal"
  ]
}
```

### Verification Summary

{"event":"verification_plan_ready","blueprintName":"backfill-pipeline","fileCount":2,"testCount":1,"runtimeCommandCount":3,"contractVersion":"1"}

## Checklist Items Exercised

- Stream I/O placement (getWritable in workflow context, write in step context)
- Stream namespace separation (progress, errors, status channels)
- Terminal signals (workflow.completed and workflow.failed on every exit path)
- Structured stream events (JSON with event, timestamp, data)
- Self-describing progress (cumulative totals in each event)
- Operator-queryable state (no runtime access needed to diagnose failures)
- Integration test coverage (happy path with stream verification, error streaming, terminal signal)
