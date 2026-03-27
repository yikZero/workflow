# Golden Scenario: Approval Timeout with Streaming

## Scenario

An expense approval workflow that waits for a manager's hook-based approval with a 24-hour timeout (sleep). While waiting, it streams status updates to the UI. If the timeout expires, the request is auto-escalated.

## What the Build Skill Should Catch

### Phase 2 — Traps Flagged

1. **Stream I/O placement** — `getWritable()` may be called in workflow context to obtain a stream reference, but actual stream writes (`write()`, `close()`) must happen inside a `"use step"` function. The workflow orchestrator cannot hold stream I/O across replay boundaries.
2. **Determinism boundary** — Stream writes are I/O. A workflow function that directly calls `write()` violates the orchestrate-only rule.
3. **Hook token strategy** — The approval hook should use a deterministic token like `approval:${expenseId}` to be collision-free across concurrent runs.

### Phase 3 — Failure Modes Decided

- `validateExpense`: `FatalError` for invalid data (code/data bug). Database read failures should be `RetryableError`.
- `notifyManager`: `RetryableError` with `maxRetries: 3` — notification delivery is transient.
- `streamStatus`: `RetryableError` with `maxRetries: 2` — stream writes are I/O.
- `processDecision`: `RetryableError` with `maxRetries: 2` — database update may fail transiently.
- `escalateOnTimeout`: `RetryableError` with `maxRetries: 3` — escalation must eventually succeed.

## Expected Code Output

```typescript
"use workflow";

import { FatalError, RetryableError, getWritable } from "workflow";
import { createHook, sleep } from "workflow";

type ApprovalDecision = { approved: boolean; reason?: string };

const validateExpense = async (expenseId: string) => {
  "use step";
  const expense = await db.expenses.findUnique({ where: { id: expenseId } });
  if (!expense) throw new FatalError("Expense not found");
  return expense;
};

const notifyManager = async (expenseId: string, managerId: string) => {
  "use step";
  await notifications.send({
    idempotencyKey: `notify:${expenseId}`,
    to: managerId,
    template: "expense-approval-request",
  });
};

const writeStatus = async (
  stream: ReturnType<typeof getWritable>,
  status: string
) => {
  "use step";
  // Stream I/O must happen in a step, not in workflow context
  const writer = stream.getWriter();
  await writer.write(status);
  writer.releaseLock();
};

const processDecision = async (
  expenseId: string,
  decision: ApprovalDecision
) => {
  "use step";
  await db.expenses.update({
    where: { id: expenseId },
    data: {
      status: decision.approved ? "approved" : "rejected",
      reason: decision.reason,
    },
  });
  return decision;
};

const escalate = async (expenseId: string) => {
  "use step";
  await notifications.send({
    idempotencyKey: `escalate:${expenseId}`,
    to: "vp-finance",
    template: "expense-escalation",
  });
  await db.expenses.update({
    where: { id: expenseId },
    data: { status: "escalated" },
  });
};

export default async function expenseApproval(
  expenseId: string,
  amount: number,
  managerId: string
) {
  const expense = await validateExpense(expenseId);

  await notifyManager(expenseId, managerId);

  // getWritable() can be called in workflow context
  const stream = getWritable("expense-status");
  await writeStatus(stream, "waiting-for-approval");

  // Race: hook approval vs 24h timeout
  const hook = createHook<ApprovalDecision>(`approval:${expenseId}`);
  const timeout = sleep("24h");

  const result = await Promise.race([hook, timeout]);

  if (result === undefined) {
    // Timeout fired — escalate
    await writeStatus(stream, "escalating");
    await escalate(expenseId);
    return { expenseId, status: "escalated" };
  }

  // Manager responded
  await writeStatus(stream, result.approved ? "approved" : "rejected");
  await processDecision(expenseId, result);

  return { expenseId, status: result.approved ? "approved" : "rejected" };
}
```

## Expected Test Output

```typescript
import { describe, it, expect } from "vitest";
import { start, resumeHook, getRun } from "workflow/api";
import { waitForHook, waitForSleep } from "@workflow/vitest";
import expenseApproval from "../workflows/expense-approval";

describe("expenseApproval", () => {
  it("manager approves before timeout", async () => {
    const run = await start(expenseApproval, ["exp-1", 200, "manager-1"]);

    await waitForHook(run, { token: "approval:exp-1" });
    await resumeHook("approval:exp-1", { approved: true });

    await expect(run.returnValue).resolves.toEqual({
      expenseId: "exp-1",
      status: "approved",
    });
  });

  it("escalates when manager does not respond within 24h", async () => {
    const run = await start(expenseApproval, ["exp-2", 500, "manager-2"]);

    const sleepId = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });

    await expect(run.returnValue).resolves.toEqual({
      expenseId: "exp-2",
      status: "escalated",
    });
  });
});
```

## Checklist Items Exercised

- Stream I/O placement
- Determinism boundary
- Hook token strategy
- Integration test coverage (timeout path, approval path)
- Retry semantics
