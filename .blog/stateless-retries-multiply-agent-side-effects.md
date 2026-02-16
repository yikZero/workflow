# Stateless retries multiply agent side effects

## Headline finding

Stateless architectures turn agent reliability problems into duplication problems. Any restart — timeout, crash, deploy, scale event — pushes you toward re-executing earlier tool calls unless you built a persistence layer that can prove what already happened.

Durable execution flips that. It records step inputs and outputs in an event log and deterministically replays the agent loop, so restarts rehydrate state instead of repeating side effects.

## Methodology

Model an agent run as a sequence of `n` tool calls. Each call succeeds with probability `s` and fails transiently with probability `p = 1 - s`.

Compare two implementations:

- **Stateless restart:** on any failure (or timeout that looks like failure), rerun the whole function from the beginning. This matches the common "retry the request" approach when you lack per-call checkpointing.
- **Durable steps:** isolate each tool call in a step (`'use step'`). If a call fails transiently, retry that step. The workflow (`'use workflow'`) replays from the event log and skips completed steps.

This is a simplified model. It ignores correlated failures and assumes you can retry until success. In the real system you cap retries (Workflow DevKit defaults to 3 retries unless you override `stepFn.maxRetries`) and you may delay retries with `RetryableError`.

## Data

The cost metric is "how many tool calls do we execute to finish one successful run," because tool calls dominate agent cost and risk (tokens, rate limits, side effects).

For the stateless restart model, the run succeeds only after `n` consecutive successes. The expected number of calls until that happens is:

`E[calls] = (1 - s^n) / (p * s^n)`

For durable steps, each call retries independently. The expected number of call attempts is:

`E[calls] = n / s`

| Steps in run (`n`) | Transient failure rate (`p`) | Stateless restart: expected calls | Durable steps: expected calls | Restart overhead | Durable overhead |
| --: | --: | --: | --: | --: | --: |
| 10 | 1% | 10.57 | 10.10 | 1.06x | 1.01x |
| 20 | 1% | 22.26 | 20.20 | 1.11x | 1.01x |
| 40 | 1% | 49.48 | 40.40 | 1.24x | 1.01x |
| 10 | 5% | 13.40 | 10.53 | 1.34x | 1.05x |
| 20 | 5% | 35.79 | 21.05 | 1.79x | 1.05x |
| 40 | 5% | 135.63 | 42.11 | 3.39x | 1.05x |

The gap grows with run length. At a 5% transient failure rate across 40 calls, the stateless restart model executes ~3.4x the work, on average, to get one successful completion.

That "extra work" is not free retries. It is duplicated tool calls. If any of those tool calls write to external systems, you also created duplicated side effects unless you designed every tool integration to be idempotent.

## Core insight

Agent workflows compound failure probability. A single run touches many systems, and each system has its own tail latency and transient errors.

Stateless runtimes give you one recovery primitive: re-execute code. That works for pure functions. Agents are not pure. They read and write external state, and they do it many times per run.

Workflow DevKit uses a different recovery primitive: replay. The workflow function runs in a deterministic sandbox. Steps isolate side effects and persist their results to an append-only event log. On restart, the workflow replays and step calls resolve from recorded outputs. A transient failure retries only the failing step.

This is the practical difference between "retry is correct" and "retry is dangerous."

## Practical takeaway

If your agent touches external systems, treat every tool call as a durable step. Keep orchestration in the workflow and error policy in steps (`FatalError` for permanent failures, `RetryableError` for transient failures with backoff).

```bash
npx workflow inspect run <run_id>
```

---

## Style justification

**What works extremely well:**
- Title follows the research post pattern perfectly — states the finding ("Stateless retries multiply agent side effects"), not the question. Compare to "AGENTS.md outperforms skills in our agent evals."
- The data table is the strongest element. It follows the Vercel research pattern: simplest possible table, one clear variable, ascending values that build to the headline result (3.39x overhead). The "AGENTS.md" post used the same structure.
- Mathematical formulas add genuine authority. This is not opinion — it is a derivable result. Vercel research posts lead with data, not argument.
- "This is a simplified model" matches the Vercel pattern of honest difficulty: acknowledge limitations as technical facts, not apologies.
- "retry is correct" vs. "retry is dangerous" — this closing line is the kind of quotable insight Vercel research posts end on. Compare to "Passive context beats active retrieval."
- Paragraphs are tight. The core insight section is 4 sentences, 3 paragraphs. Maximum density.

**What could be stronger:**
- The methodology section describes a theoretical model, not empirical data. The "AGENTS.md" post ran actual evals with pass rates. A reader might ask "did you measure this on real agent runs?" Adding even one real-world data point (e.g., "across 1,000 production agent runs, we observed a 4.2% transient failure rate") would close that gap.
- The formulas assume geometric distributions and independence — reasonable but worth stating explicitly for a research-style post. The "simplified model" caveat partially covers this.
- No visual. Vercel research posts with tables often benefit from a chart showing the divergence curve. The 3.39x figure at 40 steps / 5% failure rate deserves a visual.

**Alternative approaches:**
1. **Empirical-first:** Run actual agent workloads on stateless vs. durable, measure tool call counts, and report observed overhead. Replace the theoretical model with production data. Harder to produce but more authoritative.
2. **Side-effect focused:** Narrow the article to side-effect duplication specifically. Title: "Agent retries duplicate side effects at scale." Drop the formula and instead catalog real failure scenarios: double-charged payments, duplicate tickets, repeated emails. More visceral for engineering readers.
3. **Comparative architecture:** Add a third column to the table — "stateless with manual checkpointing" — showing the engineering effort to approach durable performance without the framework. This makes the build-vs-buy argument explicit without stating it.
