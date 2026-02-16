# Workflow DevKit keeps Agents' tool-call volume linear under retries

## Headline finding

Stateless retries turn an Agent's tool calls into repeated work. As the number of tool calls per run grows, the expected number of executed calls grows faster than linearly because a single failure forces a full replay of the prefix.

Workflow DevKit changes the unit of retry. The workflow replays deterministically, but completed steps return recorded results. A transient failure retries one step, not the entire Agent turn.

## Methodology

Model an Agent run as `N` sequential tool calls. Each call fails transiently with probability `p` and succeeds with probability `q = 1 - p`.

Compare two retry strategies:

* **Stateless retry:** a failure restarts the whole run from tool call 1.
* **Durable step retry:** a failure retries only the failed call; prior successful calls do not re-execute.

This isolates the retry surface area. It does not assume anything about the LLM or tools beyond an independent per-call failure rate.

## Data

With stateless retry, the run completes only after it achieves `N` consecutive successful calls. The expected number of executed calls is:

`E_stateless = (1 - q^N) / (p * q^N)`

With durable step retry, each call is a geometric retry until success, so:

`E_durable = N / q`

Concrete numbers:

* `p = 0.02`, `N = 40`: stateless `62.2` calls vs durable `40.8` calls (1.52x).
* `p = 0.05`, `N = 20`: stateless `35.8` calls vs durable `21.1` calls (1.70x).
* `p = 0.10`, `N = 40`: stateless `666.5` calls vs durable `44.4` calls (15.0x).

The ratio compounds because stateless retry forces the run to finish the entire chain without a single transient failure. Durable steps turn that into independent retries per call.

## Core insight

In agent workloads, the expensive part is not the control flow. It is the tool boundary: API calls, database writes, emails, payments, rate-limited endpoints. Stateless retry replays those boundaries unless the application builds its own ledger of what already executed.

That ledger is the same thing a durable runtime provides: an event log keyed by stable correlation ids. Workflow DevKit already emits a correlation id per step and records its lifecycle (`created`, `started`, `retrying`, `completed`, `failed`). Replay rehydrates the workflow and returns step results without re-executing successful calls.

## Practical takeaway

Use durable steps for every side-effecting tool call. Keep the workflow function deterministic and let the runtime handle replay and selective retry. If a tool supports idempotency keys, derive the key from the step correlation id instead of inventing your own scheme.

### Stateless retry duplicates work

**Before: retrying an Agent turn replays the full prefix**

```ts
export async function agentTurn(input: Input) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const a = await toolA(input);
      const b = await toolB(a);
      const c = await toolC(b);
      return { a, b, c };
    } catch (err) {
      if (attempt === 5) throw err;
      await sleepMs(1000 * attempt);
    }
  }
  throw new Error("unreachable");
}
```

**After: durable steps replay successful calls and retry only the failed one**

```ts
import { RetryableError } from "workflow";

async function toolA(input: Input) { 'use step'; return callA(input); }
async function toolB(a: A) { 'use step'; return callB(a); }
async function toolC(b: B) {
  'use step';
  const res = await callC(b);
  if (res.transient === true) throw new RetryableError("toolC transient", { retryAfter: "2s" });
  return res;
}

export async function agentTurn(input: Input) {
  'use workflow';
  const a = await toolA(input);
  const b = await toolB(a);
  return await toolC(b);
}
```

### Stop managing idempotency keys by hand

**Before: generating and persisting idempotency keys across retries**

```ts
import { sql } from "./db";
import { randomUUID } from "crypto";

export async function purchase(runId: string, userId: string) {
  const row = await sql`SELECT charge_key, email_key FROM runs WHERE id=${runId}`;
  const chargeKey = row.charge_key ?? randomUUID();
  const emailKey = row.email_key ?? randomUUID();
  await sql`UPDATE runs SET charge_key=${chargeKey}, email_key=${emailKey} WHERE id=${runId}`;
  await stripe.charges.create({ amount: 499, customer: userId }, { idempotencyKey: chargeKey });
  await sendReceiptEmail(userId, { idempotencyKey: emailKey });
}
```

**After: use the step correlation id as the idempotency key**

```ts
import { getStepMetadata } from "workflow";

async function chargeCard(userId: string, amount: number) {
  'use step';
  const { stepId } = getStepMetadata();
  return stripe.charges.create({ amount, customer: userId }, { idempotencyKey: stepId });
}
async function sendReceipt(userId: string) {
  'use step';
  const { stepId } = getStepMetadata();
  await mailer.sendReceipt({ userId }, { idempotencyKey: stepId });
}

export async function purchase(userId: string) {
  'use workflow';
  await chargeCard(userId, 499);
  await sendReceipt(userId);
}
```

```bash
npx -y -p @workflow/cli wf inspect runs
```
