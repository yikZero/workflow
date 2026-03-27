# Golden: Human-in-the-Loop with Streaming

## Scenario

An AI agent workflow that generates a draft, streams progress to the UI, waits
for human review via a hook, then finalizes. Combines human-in-the-loop
suspension with real-time streaming output.

## Prompt

> Design a workflow where an AI agent generates a report draft, streams progress
> to the user in real time, then pauses for human review before publishing.

## Expected Blueprint Properties

| Property | Expected Value |
|----------|---------------|
| `name` | `agent-report` or similar |
| `trigger.type` | `api_route` |
| `steps[].runtime` | All I/O and streaming in `step`, orchestration in `workflow` |
| `suspensions` | Must include `{ kind: "hook", tokenStrategy: "deterministic" }` |
| `streams` | At least one entry with a `payload` describing progress updates |
| `steps` using `getWritable` | `getWritable()` may be called in workflow or step context; stream writes must be inside `"use step"` functions |

### Suspension Details

- **Hook:** Uses `createHook()` with a deterministic token like
  `review:${reportId}` so the UI can display a review button linked to a known
  token. The hook payload type should include `{ approved: boolean; feedback?: string }`.

### Stream Details

- **Progress stream:** `getWritable()` may be called in workflow or step context
  to obtain a writable stream reference, but a step pushes incremental progress
  (e.g. generated paragraphs, percentage updates) to the UI via direct stream I/O.
- Direct stream I/O (`getWriter()`, `write()`, `close()`) must happen inside
  `"use step"` functions. The workflow orchestrator must not perform stream I/O.

### Step Boundaries

- `generateDraft` — a step that calls the AI model and streams intermediate
  results via `getWritable()`. Uses `RetryableError` for transient AI API failures.
- `waitForReview` — the workflow suspends with a `createHook()` for human review.
- `finalize` — a step that publishes the approved report. Must have an
  `idempotencyKey` to prevent double-publishing.

## Expected Anti-Pattern Callouts

The blueprint `antiPatternsAvoided` array must include:

- `Direct stream I/O in workflow context` — `getWritable()` may be called anywhere,
  but direct stream reads/writes must be inside steps, not in the workflow orchestrator.
- `Node.js APIs inside "use workflow"` — AI SDK calls, stream handling, and
  database writes must all live in steps.
- `Mutating step inputs without returning` — the draft generated in one step
  must be returned and reassigned in the workflow.
- `Missing idempotency for side effects` — the finalize step must be idempotent.
- `Over-granular step boundaries` — don't split generate + stream into separate
  steps when they are a single logical operation.

## Expected Test Helpers

The blueprint `tests` array must include a test entry using these helpers:

| Helper | Purpose |
|--------|---------|
| `start` | Launch the agent workflow |
| `waitForHook` | Wait for the workflow to reach the review hook |
| `resumeHook` | Provide the review decision to advance past the hook |
| `getRun` | Retrieve the run to inspect final state |

### Integration Test Skeleton

```ts
import { describe, it, expect } from 'vitest';
import { start, getRun, resumeHook } from 'workflow/api';
import { waitForHook } from '@workflow/vitest';
import { agentReportWorkflow } from './agent-report';

describe('agentReportWorkflow', () => {
  it('publishes when human approves', async () => {
    const run = await start(agentReportWorkflow, ['report-001']);

    // Wait for the review hook after draft generation + streaming
    await waitForHook(run, { token: 'review:report-001' });
    await resumeHook('review:report-001', {
      approved: true,
    });

    await expect(run.returnValue).resolves.toEqual({
      status: 'published',
      reportId: 'report-001',
    });
  });

  it('returns to drafting when human requests changes', async () => {
    const run = await start(agentReportWorkflow, ['report-002']);

    await waitForHook(run, { token: 'review:report-002' });
    await resumeHook('review:report-002', {
      approved: false,
      feedback: 'Add more detail to section 3',
    });

    // Workflow should re-enter drafting and stream again
    await waitForHook(run, { token: 'review:report-002' });
    await resumeHook('review:report-002', {
      approved: true,
    });

    await expect(run.returnValue).resolves.toEqual({
      status: 'published',
      reportId: 'report-002',
    });
  });
});
```

## Verification Criteria

A blueprint produced by `workflow-design` for this scenario is correct if:

1. The hook uses `createHook()` with a deterministic token (not `createWebhook()`).
2. At least one step uses `getWritable()` for streaming and that step is marked
   `runtime: "step"`.
3. The `streams` array is non-empty with a meaningful `payload` description.
4. Stream I/O does NOT appear in the workflow orchestrator.
5. The AI generation step uses `RetryableError` for transient failures.
6. The finalize step has an `idempotencyKey`.
7. The test plan includes `waitForHook` and `resumeHook`.
8. The `antiPatternsAvoided` array includes `Stream reads/writes in workflow context`.
