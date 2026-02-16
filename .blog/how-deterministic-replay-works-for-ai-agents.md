# How Workflow DevKit executes Agents with deterministic replay

## Problem

An Agent that calls tools is a distributed system in a single function body. It crosses process boundaries every time it waits on the network, hits a timeout, or gets retried by the platform. Stateless retries re-run code, not intent.

The usual mitigation is "checkpoint everything." After every tool call you write a cursor and a blob of state to durable storage. On restart you read the checkpoint and try to reconstruct what happened. This approach turns agent code into a database-backed interpreter.

## Approach

Workflow DevKit splits Agent code into two execution models:

* **Workflow functions** (`'use workflow'`) run inside a sandboxed VM. They orchestrate control flow, hold state in local variables, and stay deterministic.
* **Step functions** (`'use step'`) run with full Node.js access. They perform side effects: network calls, SDKs, file I/O, crypto, and timers.

The runtime persists every step boundary as an event in an append-only log. When the workflow runs again, it replays the workflow from the top, feeds it the same event stream, and returns recorded results for completed steps. Only missing or failed steps execute.

That design targets the failure modes that break agents in production: cold starts mid-conversation, platform timeouts, partial success in parallel fanout, and flaky tool calls.

## Implementation details

### Build-time split: workflow bundle vs step bundle

A workflow file contains both orchestrator code and side-effecting code. Workflow DevKit's build pipeline uses an SWC transform to recognize the `'use workflow'` / `'use step'` directives and split them into separate bundles.

That split is what makes the runtime model crisp: orchestrators run in a deterministic VM, and steps run in normal Node.js. You still write a single file.

### Determinism in the workflow VM

The workflow VM runs under constraints that make replay reliable:

* `Math.random()` is seeded per workflow run.
* `Date.now()` is fixed and advanced based on event timestamps during replay.
* `crypto.getRandomValues()` and `crypto.randomUUID()` are deterministic.
* `process.env` is copied and frozen.
* Timer APIs (`setTimeout`, `setInterval`, `setImmediate`) throw. Use durable `sleep()` instead.
* Global `fetch` is blocked in workflows. Put network I/O in steps.

This matters for agents because non-determinism breaks replay. If the orchestrator reads "now" or random data to decide which tool to call, it must see the same values on every replay.

### Event log + suspension

A workflow run consumes an ordered event stream. When the workflow hits an awaited step, it looks for events with the step's correlation id:

* `step_created` confirms the step exists.
* `step_started`, `step_retrying`, `step_completed`, `step_failed` drive resolution.
* `wait_created` / `wait_completed` back durable `sleep()`.
* `hook_created` and hook completion events back external resumes.

When an awaited step has no matching event yet, the workflow throws a `WorkflowSuspension`. The suspension carries a queue of pending invocations (steps, waits, hooks). The runtime handler persists the missing `*_created` events and enqueues step executions with an idempotency key equal to the correlation id.

The workflow stops at that point. Step workers run, append completion or retry events, and re-enqueue the workflow. On the next replay, the workflow re-runs the same code and picks up exactly where it left off.

### Built-in retries at the step boundary

Step execution owns retries. A step can fail in three ways:

* Throw `FatalError` to fail the step and bubble the error to the workflow.
* Throw `RetryableError` to retry with an explicit `retryAfter`.
* Throw any other error to retry with the default policy, up to `maxRetries` (default is 3).

Retries do not re-run completed steps. The event log preserves the successful work and the orchestrator replays it.

## Code patterns

### Crash recovery without checkpoints

**Before: manual checkpoint writes and cursor recovery**

```ts
import { sql } from "./db";

export async function agentHandler(runId: string) {
  const run = await sql`SELECT cursor, state FROM agent_runs WHERE id=${runId}`;
  let { cursor, state } = run.rows[0];
  while (cursor < state.plan.length) {
    const out = await tools[state.plan[cursor]](state);
    cursor += 1;
    state = { ...state, out };
    await sql`UPDATE agent_runs SET cursor=${cursor}, state=${state} WHERE id=${runId}`;
  }
  return state;
}
```

This is a checkpointed interpreter. Every loop iteration writes to storage so the next invocation can reconstruct progress.

**After: deterministic replay, no explicit checkpoints**

```ts
async function runTool(name: string, input: unknown) {
  'use step';
  return tools[name](input);
}

export async function agentRun(plan: { name: string }[], initial: unknown) {
  'use workflow';
  let state = initial;
  for (const action of plan) state = await runTool(action.name, state);
  return state;
}
```

The workflow stores state in local variables. The runtime reconstructs those variables on replay by feeding recorded step results back into the same loop.

### Parallel fanout without bespoke orchestration

Agents fan out to keep latency bounded: search + fetch + summarize in parallel. The hard part is partial success. One branch can succeed while another fails, and a stateless retry re-executes both unless you persist per-branch outputs.

**Before: custom fanout bookkeeping to avoid redoing work**

```ts
import { sql } from "./db";

export async function fanout(runId: string) {
  await sql`UPDATE runs SET status='running' WHERE id=${runId}`;
  const [a, b] = await Promise.allSettled([callA(), callB()]);
  if (a.status === "fulfilled") await sql`UPDATE runs SET a=${a.value} WHERE id=${runId}`;
  if (b.status === "fulfilled") await sql`UPDATE runs SET b=${b.value} WHERE id=${runId}`;
  if (a.status === "rejected" || b.status === "rejected") throw new Error("retry later");
  return { a: a.value, b: b.value };
}
```

You persist intermediate results because the platform does not.

**After: Promise.all over durable steps**

```ts
async function fetchA() {
  'use step';
  return callA();
}
async function fetchB() {
  'use step';
  return callB();
}

export async function fanoutWorkflow() {
  'use workflow';
  const [a, b] = await Promise.all([fetchA(), fetchB()]);
  return { a, b };
}
```

Each step has its own event history and retry policy. If `fetchB()` fails and retries, `fetchA()` replays from its `step_completed` event without re-executing.

## Results

Workflow DevKit moves agent reliability into the runtime instead of your app code:

* Cold starts and timeouts resume from the event log, not from ad hoc checkpoints.
* Tool-call retries are selective. Completed steps return recorded results.
* Parallel fanout uses ordinary `Promise.all()` with independent step retries.
* Long waits become first-class via durable `sleep()` and hook-based resume.

The operational surface area shrinks. You stop maintaining a queue protocol, a scheduler, and a state machine schema per agent.

```bash
npx -y -p @workflow/cli wf inspect runs --limit 10
```
