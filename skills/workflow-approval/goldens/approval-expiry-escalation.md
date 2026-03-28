# Golden Scenario: Approval Expiry Escalation

## User Prompt

```
/workflow-approval Build an approval workflow for purchase orders over $5,000 with manager approval, director escalation after 48h, and auto-rejection after 24h.
```

## Scenario

A procurement system requires manager approval for purchase orders over $5,000. If the assigned manager does not approve within 48 hours, the request escalates to a director. If the director does not respond within 24 hours, the request is auto-rejected and the requester is notified.

## Context Capture

The scenario skill checks for `.workflow.md` first. In this example it does not exist, so the focused approval-specific interview runs:

| Question | Expected Answer |
|----------|----------------|
| Approval actors | Manager approves first; director is escalation approver |
| Timeout/expiry rules | Manager: 48 hours; director: 24 hours; then auto-reject |
| Hook token strategy | `approval:po-${poNumber}` for manager, `escalation:po-${poNumber}` for director |
| Side effect safety | Notification emails are safe to retry (informational only) |
| Compensation requirements | None — approval flow is read-only until final decision |
| Observability | Log approval.requested, approval.escalated, approval.decided |

The captured context is saved to `.workflow.md` with sections: Project Context, Business Rules, External Systems, Failure Expectations, Observability Needs, Approved Patterns, Open Questions.

## What the Scenario Skill Should Catch

### Phase 2 — Traps Flagged

1. **Hook token strategy** — Both approval hooks must use deterministic tokens: `approval:po-${poNumber}` and `escalation:po-${poNumber}`. Random tokens would cause collisions across concurrent PO approvals.
2. **Sleep pairing** — Each hook must race against a sleep timeout. An unguarded hook suspends the workflow indefinitely.
3. **Escalation token distinctness** — The escalation hook must use a different token prefix than the primary approval to avoid collisions.

### Phase 3 — Failure Modes Decided

- `notifyManager`: `RetryableError` with `maxRetries: 3` — email delivery is transient.
- `notifyDirector`: `RetryableError` with `maxRetries: 3` — same as manager notification.
- `notifyRequester`: `RetryableError` with `maxRetries: 3` — rejection notification must eventually succeed.
- `recordDecision`: `RetryableError` with `maxRetries: 2` — database write may fail transiently.
- Approval timeout is a domain-level outcome, not an error.

## Expected Code Output

```typescript
"use workflow";

import { FatalError, RetryableError } from "workflow";
import { createHook, sleep } from "workflow";

type ApprovalDecision = { approved: boolean; reason?: string };

const notifyApprover = async (
  poNumber: string,
  approverId: string,
  template: string
) => {
  "use step";
  await notifications.send({
    idempotencyKey: `notify:${template}:${poNumber}`,
    to: approverId,
    template,
  });
};

const recordDecision = async (
  poNumber: string,
  status: string,
  decidedBy: string
) => {
  "use step";
  await db.purchaseOrders.update({
    where: { poNumber },
    data: { status, decidedBy, decidedAt: new Date() },
  });
  return { poNumber, status, decidedBy };
};

export default async function purchaseApproval(
  poNumber: string,
  amount: number,
  managerId: string,
  directorId: string
) {
  // Step 1: Notify manager and wait for approval with 48h timeout
  await notifyApprover(poNumber, managerId, "approval-request");

  const managerHook = createHook<ApprovalDecision>(
    `approval:po-${poNumber}`
  );
  const managerTimeout = sleep("48h");
  const managerResult = await Promise.race([managerHook, managerTimeout]);

  if (managerResult !== undefined) {
    // Manager responded
    return recordDecision(
      poNumber,
      managerResult.approved ? "approved" : "rejected",
      managerId
    );
  }

  // Step 2: Manager timed out — escalate to director with 24h timeout
  await notifyApprover(poNumber, directorId, "escalation-request");

  const directorHook = createHook<ApprovalDecision>(
    `escalation:po-${poNumber}`
  );
  const directorTimeout = sleep("24h");
  const directorResult = await Promise.race([directorHook, directorTimeout]);

  if (directorResult !== undefined) {
    // Director responded
    return recordDecision(
      poNumber,
      directorResult.approved ? "approved" : "rejected",
      directorId
    );
  }

  // Step 3: Full timeout — auto-reject
  await notifyApprover(poNumber, managerId, "auto-rejection-notice");
  return recordDecision(poNumber, "auto-rejected", "system");
}
```

## Expected Test Output

```typescript
import { describe, it, expect } from "vitest";
import { start, resumeHook, getRun } from "workflow/api";
import { waitForHook, waitForSleep } from "@workflow/vitest";
import purchaseApproval from "../workflows/purchase-approval";

describe("purchaseApproval", () => {
  it("manager approves before timeout", async () => {
    const run = await start(purchaseApproval, [
      "PO-1001", 7500, "manager-1", "director-1",
    ]);

    await waitForHook(run, { token: "approval:po-PO-1001" });
    await resumeHook("approval:po-PO-1001", { approved: true });

    await expect(run.returnValue).resolves.toEqual({
      poNumber: "PO-1001",
      status: "approved",
      decidedBy: "manager-1",
    });
  });

  it("escalates to director when manager times out", async () => {
    const run = await start(purchaseApproval, [
      "PO-1002", 10000, "manager-2", "director-2",
    ]);

    // Manager timeout
    const sleepId1 = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId1] });

    // Director approves
    await waitForHook(run, { token: "escalation:po-PO-1002" });
    await resumeHook("escalation:po-PO-1002", { approved: true });

    await expect(run.returnValue).resolves.toEqual({
      poNumber: "PO-1002",
      status: "approved",
      decidedBy: "director-2",
    });
  });

  it("auto-rejects when all approvers time out", async () => {
    const run = await start(purchaseApproval, [
      "PO-1003", 6000, "manager-3", "director-3",
    ]);

    // Manager timeout
    const sleepId1 = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId1] });

    // Director timeout
    const sleepId2 = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId2] });

    await expect(run.returnValue).resolves.toEqual({
      poNumber: "PO-1003",
      status: "auto-rejected",
      decidedBy: "system",
    });
  });
});
```

## Verification Artifact

```json
{
  "contractVersion": "1",
  "blueprintName": "purchase-approval",
  "files": [
    { "kind": "workflow", "path": "workflows/purchase-approval.ts" },
    { "kind": "test", "path": "workflows/purchase-approval.integration.test.ts" }
  ],
  "testMatrix": [
    {
      "name": "happy-path",
      "helpers": ["waitForHook", "resumeHook"],
      "expects": "Manager approves before timeout"
    },
    {
      "name": "manager-timeout-escalation",
      "helpers": ["waitForHook", "resumeHook", "waitForSleep", "wakeUp"],
      "expects": "Manager times out, director approves"
    },
    {
      "name": "full-timeout-auto-rejection",
      "helpers": ["waitForSleep", "wakeUp"],
      "expects": "All approvers time out, workflow auto-rejects"
    }
  ],
  "runtimeCommands": [
    { "name": "typecheck", "command": "pnpm typecheck", "expects": "No TypeScript errors" },
    { "name": "test", "command": "pnpm test", "expects": "All repository tests pass" },
    { "name": "focused-workflow-test", "command": "pnpm vitest run workflows/purchase-approval.integration.test.ts", "expects": "purchase-approval integration tests pass" }
  ],
  "implementationNotes": [
    "Invariant: A purchase order must receive exactly one final decision: approved, rejected, or auto-rejected",
    "Invariant: Escalation must only trigger after the primary approval window expires",
    "Invariant: Hook tokens are deterministic and derived from PO number",
    "Operator signal: Log approval.requested with PO number and assigned manager",
    "Operator signal: Log approval.escalated with PO number and director",
    "Operator signal: Log approval.decided with final status and decision maker"
  ]
}
```

### Verification Summary

{"event":"verification_plan_ready","blueprintName":"purchase-approval","fileCount":2,"testCount":1,"runtimeCommandCount":3,"contractVersion":"1"}

## Checklist Items Exercised

- Hook token strategy (deterministic tokens for both approval tiers)
- Sleep pairing (every hook races against a timeout)
- Escalation behavior (distinct tokens, cascading timeouts)
- Retry semantics (notification = retryable, timeout = domain outcome)
- Integration test coverage (happy path, escalation, full timeout)
