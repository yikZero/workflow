# Golden Scenario: Multi-Event Hook Loop

## Scenario

A document review workflow where multiple reviewers must each submit feedback via hooks. The workflow must collect all reviews before proceeding, not just the first one. Uses an `AsyncIterable` hook loop pattern rather than a single `await`.

## Input Blueprint (Defective)

```json
{
  "name": "multi-reviewer",
  "goal": "Collect feedback from N reviewers before finalizing a document",
  "trigger": { "type": "api", "entrypoint": "app/api/review/route.ts" },
  "inputs": { "documentId": "string", "reviewerIds": "string[]" },
  "steps": [
    {
      "name": "createReviewHooks",
      "runtime": "step",
      "purpose": "Create one hook per reviewer",
      "sideEffects": [],
      "failureMode": "default"
    },
    {
      "name": "awaitApproval",
      "runtime": "workflow",
      "purpose": "Wait for a single reviewer hook to resolve",
      "sideEffects": [],
      "failureMode": "default"
    },
    {
      "name": "finalizeDocument",
      "runtime": "step",
      "purpose": "Mark document as reviewed and notify stakeholders",
      "sideEffects": ["document.update", "notification.send"],
      "idempotencyKey": "finalize:${documentId}",
      "failureMode": "retryable",
      "maxRetries": 2
    }
  ],
  "suspensions": [
    { "kind": "hook", "tokenStrategy": "deterministic", "payloadType": "ReviewFeedback" }
  ],
  "streams": [],
  "tests": [
    {
      "name": "single reviewer approves",
      "helpers": ["start", "waitForHook", "resumeHook"],
      "verifies": ["document finalized after one approval"]
    }
  ],
  "antiPatternsAvoided": ["Node.js API in workflow context"]
}
```

## Expected Critical Fixes

1. **Suspension primitive choice** — The blueprint uses a single-await mental model (`awaitApproval` waits for one hook) but the scenario requires collecting feedback from *all* reviewers. The workflow must use an `AsyncIterable` hook loop or `Promise.all()` over multiple hooks to wait for N events, not just one.
2. **Hook token strategy** — With multiple reviewers, each hook needs a unique deterministic token like `review:${documentId}:${reviewerId}`. The blueprint shows only one suspension entry, implying a single hook.

## Expected Should Fix

1. **Integration test coverage** — The test only covers a single reviewer. Add a test for the multi-reviewer case that calls `resumeHook` N times with different tokens and verifies all feedback is collected before finalization.
2. **Step granularity** — `createReviewHooks` is in step context, but `createHook()` with deterministic tokens can be called from workflow context. Consider whether this step is necessary or if hooks should be created directly in the workflow orchestrator.
3. **Idempotency keys** — `createReviewHooks` has no idempotency strategy. If replayed, it should not create duplicate hooks. Using deterministic tokens on `createHook()` naturally provides idempotency here.

## Checklist Items Exercised

- Suspension primitive choice (single-await vs. loop)
- Hook token strategy
- Step granularity
- Integration test coverage
- Idempotency keys
