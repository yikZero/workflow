# Golden Scenario: Multi-Event Hook Loop

## Scenario

A document review workflow where multiple reviewers must each submit feedback via hooks. The workflow must collect all reviews before proceeding, not just the first one.

## What the Build Skill Should Catch

### Phase 2 — Traps Flagged

1. **Hook token strategy** — With multiple reviewers, each hook needs a unique deterministic token like `review:${documentId}:${reviewerId}`. A single hook token would only capture the first response.
2. **Suspension primitive choice** — Waiting for N events requires either an `AsyncIterable` hook loop, `Promise.all()` over multiple hooks, or a `for await` pattern — not a single `await` on one hook.
3. **Step granularity** — `createHook()` with deterministic tokens can be called from workflow context (it's not I/O). No need to wrap hook creation in a step.
4. **Idempotency keys** — `finalizeDocument` has external side effects. Use `finalize:${documentId}` as idempotency key.

### Phase 3 — Failure Modes Decided

- `finalizeDocument`: `RetryableError` with `maxRetries: 2` — database/notification calls are transient.
- Hook creation: no failure mode needed — `createHook()` is deterministic and replay-safe.
- Each reviewer's hook resolves independently — one slow reviewer doesn't block others from submitting.

## Expected Code Output

```typescript
"use workflow";

import { createHook } from "workflow";

type ReviewFeedback = { reviewerId: string; approved: boolean; comments: string };

const finalizeDocument = async (
  documentId: string,
  reviews: ReviewFeedback[]
) => {
  "use step";
  await db.documents.update({
    where: { id: documentId },
    data: {
      status: "reviewed",
      reviews,
      idempotencyKey: `finalize:${documentId}`,
    },
  });
  await notifications.send({
    idempotencyKey: `finalize-notify:${documentId}`,
    to: "document-owner",
    template: "review-complete",
  });
  return { documentId, reviewCount: reviews.length };
};

export default async function multiReviewer(
  documentId: string,
  reviewerIds: string[]
) {
  // Create one hook per reviewer with deterministic tokens
  // createHook() can be called in workflow context — it's not I/O
  const hookPromises = reviewerIds.map((reviewerId) =>
    createHook<ReviewFeedback>(`review:${documentId}:${reviewerId}`)
  );

  // Wait for ALL reviewers, not just the first
  const reviews = await Promise.all(hookPromises);

  const result = await finalizeDocument(documentId, reviews);

  return result;
}
```

## Expected Test Output

```typescript
import { describe, it, expect } from "vitest";
import { start, resumeHook } from "workflow/api";
import { waitForHook } from "@workflow/vitest";
import multiReviewer from "../workflows/multi-reviewer";

describe("multiReviewer", () => {
  it("collects all reviews before finalizing", async () => {
    const reviewerIds = ["alice", "bob", "carol"];
    const run = await start(multiReviewer, ["doc-1", reviewerIds]);

    // Resume each reviewer's hook with unique tokens
    for (const reviewerId of reviewerIds) {
      await waitForHook(run, { token: `review:doc-1:${reviewerId}` });
      await resumeHook(`review:doc-1:${reviewerId}`, {
        reviewerId,
        approved: true,
        comments: "Looks good",
      });
    }

    const result = await run.returnValue;
    expect(result.reviewCount).toBe(3);
  });

  it("waits for slow reviewer", async () => {
    const run = await start(multiReviewer, ["doc-2", ["alice", "bob"]]);

    // Alice responds immediately
    await waitForHook(run, { token: "review:doc-2:alice" });
    await resumeHook("review:doc-2:alice", {
      reviewerId: "alice",
      approved: true,
      comments: "LGTM",
    });

    // Bob responds later
    await waitForHook(run, { token: "review:doc-2:bob" });
    await resumeHook("review:doc-2:bob", {
      reviewerId: "bob",
      approved: false,
      comments: "Needs changes",
    });

    const result = await run.returnValue;
    expect(result.reviewCount).toBe(2);
  });
});
```

## Checklist Items Exercised

- Hook token strategy (unique per reviewer)
- Suspension primitive choice (Promise.all, not single await)
- Step granularity (createHook in workflow context)
- Idempotency keys
- Integration test coverage (multi-reviewer, slow reviewer)
