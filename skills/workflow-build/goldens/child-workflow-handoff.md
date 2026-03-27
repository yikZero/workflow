# Golden Scenario: Child Workflow Handoff

## Scenario

A batch-processing workflow that receives a list of document IDs, then starts a child workflow for each document. The parent workflow awaits all child completions and aggregates results.

## What the Build Skill Should Catch

### Phase 2 — Traps Flagged

1. **`start()` placement** — Starting child workflows via `start()` is a side effect requiring full Node.js access. It must be wrapped in a `"use step"` function, not called directly from workflow context.
2. **Pass-by-value / serialization issues** — Child workflow run handles are not serializable. The step must return serializable run IDs, not live objects.
3. **Step granularity** — Starting all children in a single step means if one `start()` fails, all must retry. Consider whether each child start should be an independent step for independent retry.

### Phase 3 — Failure Modes Decided

- `startChildWorkflow`: `RetryableError` with `maxRetries: 3` — child start is a network call.
- `aggregateResults`: `RetryableError` with `maxRetries: 2` — fetching child results may fail transiently.
- Each child start is an independent step so one failure doesn't retry all.

## Expected Code Output

```typescript
"use workflow";

import { start as startChild, getRun } from "workflow/api";
import { processDocument } from "./process-document";

const startDocumentWorkflow = async (documentId: string) => {
  "use step";
  // start() must be in a step — it's a side effect
  const run = await startChild(processDocument, [documentId]);
  // Return serializable ID, not the live run object
  return run.runId;
};

const getChildResult = async (runId: string) => {
  "use step";
  const run = await getRun(runId);
  return run.returnValue;
};

export default async function batchProcessDocuments(documentIds: string[]) {
  // Start each child in its own step for independent retry
  const runIds: string[] = [];
  for (const docId of documentIds) {
    const runId = await startDocumentWorkflow(docId);
    runIds.push(runId);
  }

  // Aggregate results
  const results = [];
  for (const runId of runIds) {
    const result = await getChildResult(runId);
    results.push(result);
  }

  return { processed: results.length, results };
}
```

## Expected Test Output

```typescript
import { describe, it, expect } from "vitest";
import { start } from "workflow/api";
import batchProcessDocuments from "../workflows/batch-process-documents";

describe("batchProcessDocuments", () => {
  it("processes all documents", async () => {
    const run = await start(batchProcessDocuments, [
      ["doc-1", "doc-2", "doc-3"],
    ]);
    const result = await run.returnValue;
    expect(result.processed).toBe(3);
  });
});
```

## Checklist Items Exercised

- `start()` placement
- Pass-by-value / serialization issues
- Step granularity
- Integration test coverage
