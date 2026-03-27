# Golden Scenario: Child Workflow Handoff

## Scenario

A batch-processing workflow that receives a list of document IDs, then starts a child workflow for each document. The parent workflow awaits all child completions and aggregates results.

## Input Blueprint (Defective)

```json
{
  "name": "batch-process-documents",
  "goal": "Process a batch of documents by delegating each to a child workflow",
  "trigger": { "type": "api", "entrypoint": "app/api/batch/route.ts" },
  "inputs": { "documentIds": "string[]" },
  "steps": [
    {
      "name": "startChildWorkflows",
      "runtime": "workflow",
      "purpose": "Start a child workflow for each document",
      "sideEffects": ["workflow.start"],
      "failureMode": "default"
    },
    {
      "name": "aggregateResults",
      "runtime": "step",
      "purpose": "Collect and merge child workflow outputs",
      "sideEffects": [],
      "failureMode": "default"
    }
  ],
  "suspensions": [],
  "streams": [],
  "tests": [
    {
      "name": "processes batch",
      "helpers": ["start"],
      "verifies": ["all documents processed"]
    }
  ],
  "antiPatternsAvoided": []
}
```

## Expected Critical Fixes

1. **`start()` placement** — `startChildWorkflows` has `runtime: "workflow"` but calls `start()` which is a side effect requiring full Node.js access. Change `runtime` to `"step"`. `start()` in workflow context must be wrapped in a step.
2. **Pass-by-value / serialization issues** — If `startChildWorkflows` collects child run handles and passes them to `aggregateResults`, those handles must be serializable. Return serializable run IDs, not live objects.

## Expected Should Fix

1. **Step granularity** — Starting all child workflows in a single step means if one `start()` fails, all must retry. Consider whether each child start should be an independent step for independent retry, or if batch failure is acceptable.
2. **Integration test coverage** — Test should verify child workflow completion, not just batch start. Add `waitForHook` or polling for child completion if applicable.
3. **Anti-pattern coverage** — `antiPatternsAvoided` is empty. Should include "`start()` called directly from workflow code" and "Mutating step inputs without returning".

## Checklist Items Exercised

- `start()` placement
- Step granularity
- Pass-by-value / serialization issues
- Integration test coverage
