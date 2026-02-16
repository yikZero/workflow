# Workflow DevKit makes Agents durable

## Thesis

Production AI agents are not single HTTP requests. They are long-running programs that plan, call tools, wait on external systems, and keep internal state across dozens of decisions.

Stateless compute fights that shape. A cold start or a timeout resets the process mid-loop. A retry replays side effects unless you build your own idempotency ledger. Teams end up rebuilding durable execution out of database rows, queues, and scheduled jobs.

Workflow DevKit turns that pile of infrastructure back into code. You write an Agent as a workflow function. The runtime persists progress as an event log and deterministically replays the workflow to reconstruct state after failures, cold starts, or scale events.

## Current state

Most "production agent" stacks ship the same diagram with different logos:

* A `agent_runs` table that stores conversation state, tool history, and a cursor.
* A queue that re-invokes the agent after every tool call.
* A cron job that scans for stuck runs, retries failed calls, and advances timers.
* Idempotency keys everywhere to avoid double-charging, double-emailing, or double-writing.

This works, but it costs engineering time forever. Every tool integration becomes a mini state machine. Every new failure mode adds another column: `attempt`, `next_run_at`, `last_error`, `lock_owner`. The "agent" ends up split across handlers that must agree on invariants.

Here's the pattern in code.

**Before: DB row + queue for an Agent tool-calling loop**

```ts
import { sql } from "./db";
import { queue } from "./queue";

export async function runAgent(runId: string) {
  const run = await sql`SELECT * FROM agent_runs WHERE id=${runId}`;
  try {
    const next = await llmPlan(run.state);
    const toolOut = await callTool(next.tool, next.args, {
      idempotencyKey: `${runId}:${run.step}`,
    });
    await sql`UPDATE agent_runs SET state=${toolOut.state}, step=${run.step + 1}
              WHERE id=${runId}`;
    await queue.add("agent", { runId }, { jobId: `${runId}:${run.step + 1}` });
  } catch (err) {
    await sql`UPDATE agent_runs SET retries=${run.retries + 1}, last_error=${String(err)}
              WHERE id=${runId}`;
    await queue.add("agent", { runId }, { delay: backoff(run.retries) });
  }
}
```

The code above "works" until it doesn't. You now own locking, exactly-once semantics, backoff, and recovery. Any bug that advances `step` at the wrong time corrupts the run. Any mismatch between the stored cursor and the tool history produces duplicated tool calls.

## The shift

Durable execution flips the control plane. Instead of persisting *state* and reconstructing control flow, you persist *control flow* and reconstruct state.

Workflow DevKit records every side effect boundary as an event. When the workflow restarts, the runtime replays the workflow from the top in a deterministic sandbox and feeds it the same event stream. Completed steps return their recorded results. Pending steps suspend the workflow and get scheduled. The workflow code stays readable because it is still just async TypeScript.

**After: the same Agent as a workflow with steps**

```ts
type AgentState = { messages: string[]; done: boolean };

async function llmPlan(state: AgentState) {
  'use step';
  return decideNextAction(state.messages);
}
async function callTool(name: string, args: unknown) {
  'use step';
  return tools[name](args);
}

export async function agentLoop(initial: AgentState) {
  'use workflow';
  let state = initial;
  while (state.done === false) {
    const plan = await llmPlan(state);
    state = await callTool(plan.tool, plan.args);
  }
  return state;
}
```

The pain disappears because you stopped simulating a runtime in tables. The workflow function is the state machine. The durable log is the source of truth. Retries stop being a cross-cutting concern you re-implement for every tool.

## The vision

Agents need four things that plain serverless does not provide:

1. **State across tool calls.** The agent has to remember what already happened.
2. **Selective retries.** A transient failure should retry one tool call, not the entire run.
3. **Parallel execution.** Agents fan out: retrieval + enrichment + verification.
4. **Long waits.** Human-in-the-loop and external systems do not fit in a 10-60 second timeout.

Workflow DevKit maps those directly onto existing JavaScript primitives:

* Use local variables for state. The runtime reconstructs them by replay.
* Use `FatalError` and `RetryableError` inside steps to control retry and backoff.
* Use `Promise.all()` and `Promise.race()` in workflows for fanout and competition.
* Use `sleep()` for durable delays and hooks to pause until an external event arrives.

That last pair matters for agents because "waiting" is normal. A workflow can suspend while it waits for a webhook, a human approval, or an upstream batch job. The runtime resumes the workflow when the event shows up, without you writing a scheduler.

Retries are the other place teams burn weeks. The usual solution is a cron-driven state machine that retries failed calls and advances a `next_retry_at` timestamp.

**Before: cron + state machine retry for flaky API calls**

```ts
import { sql } from "./db";

export async function retryCron() {
  const jobs = await sql`SELECT * FROM api_calls
                         WHERE status='retry' AND run_at < now()
                         LIMIT 100`;
  for (const job of jobs.rows) {
    const res = await fetch(job.url, { method: "POST", body: job.body });
    const status = res.status < 500 ? "done" : "retry";
    await sql`UPDATE api_calls SET status=${status}, attempts=${job.attempts + 1},
              run_at=${nextRunAt(job.attempts)} WHERE id=${job.id}`;
  }
}
```

That code turns "retry an HTTP call" into an operational subsystem. The database becomes a task scheduler. The cron job becomes a reliability layer.

**After: RetryableError inside a step**

```ts
import { FatalError, RetryableError } from "workflow";

async function postInvoice(id: string) {
  'use step';
  const origin = process.env.INVOICE_API_ORIGIN ?? "";
  const res = await fetch(`${origin}/invoices/${id}`, { method: "POST" });
  if (res.status >= 500) throw new RetryableError("invoice API 5xx", { retryAfter: "30s" });
  if (res.ok === false) throw new FatalError(`invoice API ${res.status}`);
  return res.json();
}

export async function invoiceAgent(id: string) {
  'use workflow';
  return await postInvoice(id);
}
```

The step throws a structured error. The runtime persists that failure, schedules a retry with backoff, and replays the workflow without re-running completed work.

## Next steps

Treat "Agent" as a workflow boundary, not a request handler. Keep the workflow deterministic and push I/O into steps. If a piece of code needs the network, the filesystem, or a timer, it belongs in a step.

Start small. Pick one agent loop that currently writes state to a database and triggers itself via a queue. Move the loop into a workflow function. Wrap each tool call in a step function. Replace cron-based retry with `RetryableError` and durable `sleep()`.

Run the workflow locally, then inspect the event log and step timeline.

```bash
npx -y -p @workflow/cli wf inspect runs
```
