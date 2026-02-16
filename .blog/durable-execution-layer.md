# Durable execution layer

## Thesis

AI agents behave like programs, not like request handlers. They accumulate state, call tools, wait for external events, and keep going after partial failures.

A stateless function can answer a prompt. It cannot reliably run an agent loop that spans dozens of tool calls and multiple minutes of wall-clock time. Durable execution fills that gap by persisting progress and replaying the orchestration logic after a cold start, crash, or scale event.

Workflow DevKit gives JavaScript/TypeScript the missing primitive: run an agent as a workflow function that reconstructs state by deterministic replay, while isolating side effects into step functions that can retry independently.

## Current state

Most "production agents" ship as a pile of glue around a stateless compute unit. Engineers bolt on a database row for state, a queue for long work, and a set of ad-hoc idempotency keys to avoid duplicating side effects.

That stack works until the agent does anything non-trivial. A single agent run can involve: planning with an LLM, fanning out to 5-10 tools, waiting on human input, then looping until a terminal condition. If the function times out mid-loop, the system has to reconstruct "what already happened" from whatever it managed to persist.

Stateless retries amplify the problem. If a tool call fails transiently, the easiest recovery strategy is "retry the whole request." That replays earlier tool calls unless you built per-call checkpointing. When the earlier calls wrote to external systems (tickets, payments, emails), you also need idempotency across those systems. This turns the agent into a distributed transaction coordinator.

Teams reinvent the same machinery: a run table, a step table, a dedupe key per side effect, and a scheduler for "wake me up later." The code that does the real work ends up scattered across handlers, cron jobs, and background workers. The agent logic becomes hard to reason about because it does not exist as a single program.

## The shift

Agent workloads push compute in a different direction than traditional APIs.

Agents do more I/O per unit of business value. They spend most of their time waiting on other systems: model responses, rate limits, slow upstream APIs, and human approvals. The total wall-clock time for one run routinely exceeds the lifetime of any single compute instance.

Agents also make correctness harder. Tool calls create side effects. Re-executing a tool call changes the world twice. Retrying the wrong layer turns "recover from transient error" into "duplicate the user's refund."

Finally, agents want concurrency. A useful run pulls context from multiple sources in parallel and merges results into a plan. JavaScript already has the right ergonomics (`Promise.all`, `Promise.race`), but stateless environments make the failure modes unpredictable. A single timeout can force a full rerun of parallel work unless you cache each unit explicitly.

This shift turns orchestration into infrastructure. You need a durable control plane for "what should happen next," not just a faster model.

## The vision

Treat an agent run as a workflow: deterministic orchestration code that drives side-effecting steps.

Workflow functions (`'use workflow'`) provide the control loop. They run in a sandboxed VM and focus on coordination: branching, looping, parallel composition, and waiting. Step functions (`'use step'`) do the work that touches the world: calling models, fetching from APIs, writing to databases, emitting notifications.

Workflow DevKit persists every step input and output to an append-only event log. When the workflow needs to continue — after a crash, after a scale event, or after a delay — the runtime replays the workflow function from the start and rehydrates state by replaying the event log. Completed steps return their recorded results instead of re-executing.

The build pipeline enforces the boundary. An SWC transform splits a workflow file into separate bundles for workflow and step contexts, so the workflow VM never needs full Node.js access. That boundary makes determinism practical: the workflow sandbox disables global `fetch()` and timeout functions, and the runtime provides durable primitives like `sleep()` and hooks for external resumptions.

The result looks like normal async code, because it is normal async code. You write a loop. You await steps. You compose steps in parallel. You throw errors. The runtime turns that into a resumable execution with a durable log of what happened.

## Proof and early signals

You can see the design goal — "replay must produce the same decisions" — in the runtime constraints.

The workflow VM runs with deterministic time and randomness. The runtime seeds `Math.random()`, fixes `Date.now()`, and advances time based on event timestamps during replay. That removes a class of heisenbugs where "the same code" makes different choices after a restart.

The sandbox blocks the usual sources of non-determinism and side effects. Global `fetch()` throws inside workflow functions. Timeout APIs throw. If you need HTTP, you move it into a step, or you use the `fetch` helper that executes as a step. If you need delays, you call `sleep('5m')`, which records a wait in the event log and schedules a future wake-up.

Step isolation makes retries predictable. The runtime retries steps by default (3 retries unless you override per step). You can make failures explicit: throw `FatalError` to stop retrying and bubble the failure to the workflow, or throw `RetryableError` with a `retryAfter` to schedule a delayed retry. The runtime records `step_retrying` and `step_completed` events, so replay can skip completed work and only rerun the failed unit.

The framework integrations show where this fits in a real app. In Next.js, `withWorkflow()` wires build-time transforms and generates route handlers under `/.well-known/workflow/v1/`. You run the agent from your app code with `start()`, and the platform routes execution through those durable endpoints.

Observability ships as part of the workflow story. The CLI exposes run inspection and a web UI. That matters for agents because "what happened" often matters more than "what returned."

## Next steps

Start by carving your agent into a workflow loop plus steps. Keep the workflow function pure orchestration and move every side effect into a step.

Then run the local UI and watch a run advance step-by-step:

```bash
npx workflow web
```

---

## Style justification

**What works against the Vercel blog standard:**
- The opening thesis hits the pattern exactly — short declarative diagnosis, grounding the reader in a technical reality ("agents behave like programs, not like request handlers") rather than pitching a product.
- "Current state" uses the problem-evidence-claim pattern with specific technical detail ("a run table, a step table, a dedupe key per side effect"). It describes the problem space the way a Vercel engineer would: diagnostic, not dramatic.
- Paragraphs stay at 2-4 sentences. One idea per paragraph. No hedging words. No "we believe" or "we're excited."
- The title "Durable execution layer" follows the vision post pattern: short declarative noun phrase, no verb.
- Closing with `npx workflow web` follows the Vercel CTA pattern — a runnable command, not "stay tuned."

**What could be stronger:**
- The "Proof and early signals" section runs long (5 paragraphs). Vercel vision posts typically keep this to 1-2 paragraphs. The runtime detail (deterministic time seeding, `Math.random()`) feels more like engineering deep-dive material.
- Missing specific numbers. Vercel posts anchor claims in data ("2.7 million deployments daily"). This post has zero quantified metrics. Even a figure like "a typical agent run spans 15-40 tool calls" would add Vercel-style authority.
- No customer/internal validation. The "Self-driving infrastructure" post references Vercel Agent and real internal usage. This article stays abstract.

**Alternative approaches:**
1. **Customer-anchored vision:** Open with a specific team's experience building agents on stateless functions, then zoom out to the thesis. Matches how "Self-driving infrastructure" grounds in framework-defined infrastructure before going conceptual.
2. **Shorter + punchier:** Cut "Proof and early signals" to 2 paragraphs, move technical details to a linked engineering deep-dive. Vision posts are meant to inspire, not explain internals.
3. **Counter-narrative framing:** Open with "Most agent demos work. Most agent deployments don't." — a blunt one-liner like "Transcript formats are a mess" that hooks engineers who've hit this wall.
