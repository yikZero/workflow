# Golden Scenario: Approval Timeout with Streaming

## User Prompt

```
/workflow-timeout Wait 24h for manager acknowledgement, escalate for another 24h, then auto-close.
```

## Scenario

A ticket acknowledgement workflow that waits for a manager to acknowledge an issue within 24 hours. If the manager does not respond, the ticket escalates to a director with another 24-hour window. If neither responds, the ticket auto-closes. While waiting, the workflow streams status updates to the UI using `getWritable()`.

## Context Capture

The scenario skill checks for `.workflow.md` first. In this example it does not exist, so the focused timeout-specific interview runs:

| Question | Expected Answer |
|----------|----------------|
| Timeout triggers | Manager: 24 hours; Director: 24 hours; both fixed durations |
| Timeout outcomes | Manager timeout → escalate to director; Director timeout → auto-close |
| Sleep/wake-up pairing | Both hooks race against sleep; tests use `waitForSleep` and `wakeUp` |
| Hook/sleep races | Manager hook races 24h sleep; director hook races 24h sleep |
| Cascading timeouts | Two tiers: manager (24h) then director (24h) |
| Observability | Log sleep started, timeout fired, escalation triggered, auto-close |

The captured context is saved to `.workflow.md` with sections: Project Context, Business Rules, External Systems, Failure Expectations, Observability Needs, Approved Patterns, Open Questions.

## What the Scenario Skill Should Catch

### Phase 2 — Traps Flagged

1. **Sleep/wake-up correctness** — Both suspension points use `sleep("24h")`. Tests must use `waitForSleep` to capture the correlation ID and `wakeUp` to advance past the sleep without real-time waits.
2. **Hook/sleep race** — Each hook must race against its paired sleep via `Promise.race`. An unguarded hook suspends the workflow indefinitely.
3. **Deterministic hook tokens** — The manager hook uses `ack:${ticketId}` and the director hook uses `escalation:${ticketId}`. Random tokens would cause collisions across concurrent tickets.
4. **Stream I/O placement** — `getWritable()` may be called in workflow context, but actual `write()` calls must happen inside `"use step"` functions.

### Phase 3 — Failure Modes Decided

- `notifyManager`: `RetryableError` with `maxRetries: 3` — notification delivery is transient.
- `notifyDirector`: `RetryableError` with `maxRetries: 3` — same as manager notification.
- `writeStatus`: `RetryableError` with `maxRetries: 2` — stream writes are I/O.
- `recordOutcome`: `RetryableError` with `maxRetries: 2` — database write may fail transiently.
- Manager timeout is a domain-level outcome, not an error.
- Director timeout is a domain-level outcome, not an error.

## Expected Code Output

```typescript
"use workflow";

import { FatalError, RetryableError, getWritable } from "workflow";
import { createHook, sleep } from "workflow";

type AckDecision = { acknowledged: boolean; note?: string };

const notifyPerson = async (
  ticketId: string,
  personId: string,
  template: string
) => {
  "use step";
  await notifications.send({
    idempotencyKey: `notify:${template}:${ticketId}`,
    to: personId,
    template,
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

const recordOutcome = async (ticketId: string, status: string, actor: string) => {
  "use step";
  await db.tickets.update({
    where: { id: ticketId },
    data: { status, resolvedBy: actor, resolvedAt: new Date() },
  });
  return { ticketId, status, resolvedBy: actor };
};

export default async function ticketAck(
  ticketId: string,
  managerId: string,
  directorId: string
) {
  const stream = getWritable("ticket-status");

  // Tier 1: Notify manager and wait 24h
  await notifyPerson(ticketId, managerId, "ack-request");
  await writeStatus(stream, "waiting-for-manager");

  const managerHook = createHook<AckDecision>(`ack:${ticketId}`);
  const managerTimeout = sleep("24h");
  const managerResult = await Promise.race([managerHook, managerTimeout]);

  if (managerResult !== undefined) {
    await writeStatus(stream, "acknowledged");
    return recordOutcome(ticketId, "acknowledged", managerId);
  }

  // Tier 2: Manager timed out — escalate to director
  await notifyPerson(ticketId, directorId, "escalation-request");
  await writeStatus(stream, "escalated");

  const directorHook = createHook<AckDecision>(`escalation:${ticketId}`);
  const directorTimeout = sleep("24h");
  const directorResult = await Promise.race([directorHook, directorTimeout]);

  if (directorResult !== undefined) {
    await writeStatus(stream, "acknowledged-by-director");
    return recordOutcome(ticketId, "acknowledged", directorId);
  }

  // Tier 3: Full timeout — auto-close
  await writeStatus(stream, "auto-closed");
  return recordOutcome(ticketId, "auto-closed", "system");
}
```

## Expected Test Output

```typescript
import { describe, it, expect } from "vitest";
import { start, resumeHook, getRun } from "workflow/api";
import { waitForHook, waitForSleep } from "@workflow/vitest";
import ticketAck from "../workflows/ticket-ack";

describe("ticketAck", () => {
  it("manager acknowledges before timeout", async () => {
    const run = await start(ticketAck, ["ticket-1", "manager-1", "director-1"]);

    await waitForHook(run, { token: "ack:ticket-1" });
    await resumeHook("ack:ticket-1", { acknowledged: true });

    await expect(run.returnValue).resolves.toEqual({
      ticketId: "ticket-1",
      status: "acknowledged",
      resolvedBy: "manager-1",
    });
  });

  it("escalates to director when manager times out", async () => {
    const run = await start(ticketAck, ["ticket-2", "manager-2", "director-2"]);

    // Manager timeout — advance past 24h sleep
    const sleepId1 = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId1] });

    // Director acknowledges
    await waitForHook(run, { token: "escalation:ticket-2" });
    await resumeHook("escalation:ticket-2", { acknowledged: true });

    await expect(run.returnValue).resolves.toEqual({
      ticketId: "ticket-2",
      status: "acknowledged",
      resolvedBy: "director-2",
    });
  });

  it("auto-closes when all approvers time out", async () => {
    const run = await start(ticketAck, ["ticket-3", "manager-3", "director-3"]);

    // Manager timeout
    const sleepId1 = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId1] });

    // Director timeout
    const sleepId2 = await waitForSleep(run);
    await getRun(run.runId).wakeUp({ correlationIds: [sleepId2] });

    await expect(run.returnValue).resolves.toEqual({
      ticketId: "ticket-3",
      status: "auto-closed",
      resolvedBy: "system",
    });
  });
});
```

## Verification Artifact

```json
{
  "contractVersion": "1",
  "blueprintName": "ticket-ack",
  "files": [
    { "kind": "workflow", "path": "workflows/ticket-ack.ts" },
    { "kind": "test", "path": "workflows/ticket-ack.integration.test.ts" }
  ],
  "testMatrix": [
    {
      "name": "happy-path",
      "helpers": ["waitForHook", "resumeHook"],
      "expects": "Manager acknowledges before timeout"
    },
    {
      "name": "manager-timeout-escalation",
      "helpers": ["waitForHook", "resumeHook", "waitForSleep", "wakeUp"],
      "expects": "Manager times out, director acknowledges"
    },
    {
      "name": "full-timeout-auto-close",
      "helpers": ["waitForSleep", "wakeUp"],
      "expects": "All approvers time out, workflow auto-closes"
    }
  ],
  "runtimeCommands": [
    { "name": "typecheck", "command": "pnpm typecheck", "expects": "No TypeScript errors" },
    { "name": "test", "command": "pnpm test", "expects": "All repository tests pass" },
    { "name": "focused-workflow-test", "command": "pnpm vitest run workflows/ticket-ack.integration.test.ts", "expects": "ticket-ack integration tests pass" }
  ],
  "implementationNotes": [
    "Invariant: A ticket must receive exactly one final outcome: acknowledged or auto-closed",
    "Invariant: Escalation must only trigger after the manager timeout expires",
    "Invariant: Hook tokens are deterministic and derived from ticket ID",
    "Operator signal: Log timeout.fired with ticketId when sleep wins the race",
    "Operator signal: Log escalation.triggered with ticketId and director",
    "Operator signal: Log ticket.resolved with final status and actor"
  ]
}
```

### Verification Summary

{"event":"verification_plan_ready","blueprintName":"ticket-ack","fileCount":2,"testCount":3,"runtimeCommandCount":3,"contractVersion":"1"}

## Checklist Items Exercised

- Sleep/wake-up correctness (waitForSleep + wakeUp in every timeout test)
- Hook/sleep races (Promise.race for both approval tiers)
- Deterministic hook tokens (ack:${ticketId}, escalation:${ticketId})
- Stream I/O placement (getWritable in workflow, write in steps)
- Timeout as domain outcome (not an error)
- Cascading timeouts (two-tier escalation)
- Integration test coverage (happy path, escalation, full timeout)
