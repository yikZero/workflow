---
name: workflow-build
description: Build durable workflows interactively, guided by project context from .workflow.md. Reads the API reference, applies a stress checklist, and produces TypeScript code + tests. Use after workflow-teach. Triggers on "build workflow", "workflow-build", "implement workflow", or "create workflow".
metadata:
  author: Vercel Inc.
  version: '0.2'
---

# workflow-build

Use this skill when the user wants to build a durable workflow. It reads project context, walks through design decisions interactively, and produces working TypeScript code with integration tests.

## Skill Loop Position

**Stage 2 of 2** in the workflow skill loop: teach → **build**

| Stage | Skill | Purpose |
|-------|-------|---------|
| 1 | workflow-teach | Capture project context into `.workflow.md` |
| **2** | **workflow-build** (you are here) | Build workflow code guided by context |

**Prerequisite:** Run `workflow-teach` first to populate `.workflow.md`. If `.workflow.md` does not exist, tell the user to run `workflow-teach` first.

## Inputs

Always read these before producing output:

1. **`skills/workflow/SKILL.md`** — the authoritative API truth source. Reference it for all runtime behavior, syntax, and test helper documentation.
2. **`.workflow.md`** — the project-specific context captured by `workflow-teach`. Use this to inform step boundaries, failure modes, idempotency strategies, and test coverage.

## Interactive Build Process

Walk through these phases in order. Present your work at each phase and wait for user confirmation before proceeding to the next.

### Phase 1 — Propose step boundaries

Read `.workflow.md` and the user's description of the workflow they want to build. Propose:

- Which functions need `"use workflow"` (orchestrators) vs `"use step"` (side effects)
- Step boundaries — what belongs in each step and why
- Suspension points — hooks, webhooks, or sleeps needed
- Stream requirements — what needs to be streamed to the UI or logs

Reference the **Business Rules** and **External Systems** sections of `.workflow.md` to justify your proposals. Present the step breakdown to the user and wait for confirmation.

### Phase 2 — Flag relevant traps

Run every item in the Stress Checklist (below) against the proposed step breakdown. For each item that reveals a risk or issue:

- Name the checklist item
- Explain what's at risk
- Propose a concrete fix

Present all findings to the user. If any require changing the step boundaries from Phase 1, propose the changes.

### Phase 3 — Decide failure modes

For each step, decide:

- **FatalError vs RetryableError** — reference `.workflow.md` "Failure Expectations" for what counts as permanent vs transient in this project
- **Idempotency strategy** — every step with external side effects must have one. Reference `.workflow.md` "Business Rules" for domain-specific idempotency requirements
- **Compensation plan** — for each irreversible side effect, state what happens if a later step fails. Reference `.workflow.md` "Failure Expectations" for compensation rules

Present the failure model to the user and wait for confirmation.

### Phase 4 — Write code + tests

Produce two files:

1. **Workflow file** (`workflows/<name>.ts`) — contains `"use workflow"` orchestrator and `"use step"` functions following the confirmed step boundaries, failure modes, and idempotency strategies.
2. **Test file** (`__tests__/<name>.test.ts`) — integration tests using `vitest` and `@workflow/vitest`. Must cover:
   - Happy path
   - Each suspension point (hook → `waitForHook`/`resumeHook`, webhook → `waitForHook`/`resumeWebhook`, sleep → `waitForSleep`/`wakeUp`)
   - At least one failure path per error classification
   - Compensation paths if applicable

Use the test helpers and patterns documented in `skills/workflow/SKILL.md`.

### Phase 5 — Self-review

Before presenting the final code, run the Stress Checklist one more time against the actual generated code. Fix any issues found. Present the final code with a summary of what the self-review caught and fixed (if anything).

### Phase 6 — Verification Summary

After presenting the final code and self-review, emit a **Verification Artifact** section containing the full verification plan JSON, followed immediately by a single-line **Verification Summary** that an agent can extract in one parse step.

#### Verification Artifact

Present the full verification plan as a fenced JSON block:

```json
{
  "contractVersion": "1",
  "blueprintName": "<workflow-name>",
  "files": [
    { "kind": "workflow", "path": "workflows/<name>.ts" },
    { "kind": "route", "path": "app/api/<name>/route.ts" },
    { "kind": "test", "path": "workflows/<name>.integration.test.ts" }
  ],
  "runtimeCommands": [
    { "name": "typecheck", "command": "pnpm typecheck", "expects": "No TypeScript errors" },
    { "name": "test", "command": "pnpm test", "expects": "All repository tests pass" },
    { "name": "focused-workflow-test", "command": "pnpm vitest run workflows/<name>.integration.test.ts", "expects": "<name> integration tests pass" }
  ],
  "implementationNotes": [
    "Invariant: ...",
    "Operator signal: ..."
  ]
}
```

#### Verification Summary

Immediately after the artifact block, emit a single line of valid JSON with these exact fields:

```
{"event":"verification_plan_ready","blueprintName":"<name>","fileCount":<n>,"testCount":<n>,"runtimeCommandCount":<n>,"contractVersion":"1"}
```

- `event` — always `"verification_plan_ready"`
- `blueprintName` — matches the artifact's `blueprintName`
- `fileCount` — number of entries in `files`
- `testCount` — number of entries in `files` where `kind` is `"test"`
- `runtimeCommandCount` — number of entries in `runtimeCommands`
- `contractVersion` — always `"1"`

This summary must be valid single-line JSON. It allows agents to extract verification status in one parse step while humans still get the full artifact and narrative sections above.

## Stress Checklist

Run every item against the workflow — first during Phase 2 (against the proposed design) and again during Phase 5 (against the generated code).

### 1. Determinism boundary
- Does any `"use workflow"` function perform I/O, direct stream I/O, or use Node.js-only APIs?
- If the workflow uses time or randomness, is it relying only on the Workflow DevKit's seeded workflow-context APIs rather than external nondeterministic sources?

### 2. Step granularity
- Are steps too granular (splitting a single logical operation into many tiny steps)?
- Are steps too coarse (grouping unrelated side effects that need independent retry)?
- Does each step represent a meaningful unit of work with clear retry semantics?

### 3. Pass-by-value / serialization issues
- Does any step mutate its input without returning the updated value?
- Are all step inputs and outputs JSON-serializable?
- Are there closures, class instances, or functions passed between workflow and step contexts?

### 4. Hook token strategy
- Does `createHook()` use deterministic tokens where appropriate (e.g. `approval:${entityId}`)?
- Is `createWebhook()` incorrectly using custom tokens? (It must not.)
- Are hook tokens unique enough to avoid collisions across concurrent runs?

### 5. Webhook response mode
- Is the webhook response mode (`static` or `manual`) appropriate for the use case?
- Does a `static` webhook correctly return a fixed response without blocking?

### 6. `start()` placement
- Is `start()` (child workflow invocation) called directly from workflow context? (It must be wrapped in a step.)

### 7. Stream I/O placement
- Does any workflow directly call `getWriter()`, `write()`, `close()`, or read from a stream?
- If `getWritable()` is called in workflow context, is the stream only being obtained and then passed into a step for actual I/O?

### 8. Idempotency keys
- Does every step with external side effects have an idempotency strategy?
- Are idempotency keys derived from stable, unique identifiers (not timestamps or random values)?

### 9. Retry semantics
- Is `FatalError` used for genuinely permanent failures (invalid input, already-processed, auth denied)?
- Is `RetryableError` used for genuinely transient failures (network timeout, rate limit, temporary unavailability)?
- Are `maxRetries` values reasonable for each step's failure mode?

### 10. Rollback / compensation strategy
- If a step fails after prior steps have committed side effects, is there a compensation step?
- Are partial-success scenarios handled (e.g. payment charged but email failed)?

### 11. Observability streams
- Does the workflow emit enough progress information for monitoring?
- Are stream namespaces used to separate different types of progress data?

### 12. Integration test coverage
- Does the test plan cover the happy path?
- Does the test plan cover each suspension point (hook, webhook, sleep)?
- Does the test plan verify failure paths (`FatalError`, `RetryableError`, timeout)?
- Are the correct test helpers used (`waitForHook`, `resumeHook`, `waitForSleep`, `wakeUp`, etc.)?

## Hard Rules

These rules are non-negotiable. Violating any of them means the generated code is incorrect:

1. **Workflow functions orchestrate only.** A `"use workflow"` function must not perform I/O, access Node.js APIs, read/write streams, call databases, or invoke external services directly.
2. **All side effects live in `"use step"`.** Every I/O operation — SDK calls, database queries, filesystem access, HTTP requests, external API calls — must be inside a `"use step"` function.
3. **`createHook()` may use deterministic tokens.** When a hook needs a stable, predictable token (e.g. `approval:${documentId}`), use `createHook()` with a deterministic token string.
4. **`createWebhook()` may NOT use deterministic tokens.** Webhooks generate their own tokens. Do not pass custom tokens to `createWebhook()`.
5. **Stream I/O happens in steps.** `getWritable()` may be called in workflow or step context, but any direct stream interaction must be inside `"use step"` functions. The workflow orchestrator cannot hold stream I/O across replay boundaries.
6. **`start()` inside a workflow must be wrapped in a step.** Starting a child workflow is a side effect requiring full Node.js access. Wrap it in a `"use step"` function.
7. **Return mutated values from steps.** Step functions use pass-by-value semantics. If you modify data inside a step, `return` the new value and reassign it in the calling workflow. Mutations to the input object are lost after replay.
8. **Recommend `FatalError` or `RetryableError` intentionally.** Every error classification must have a clear rationale. `FatalError` means "do not retry, this is a permanent failure." `RetryableError` means "transient issue, try again." Never use one vaguely.

## Anti-Patterns to Avoid

Flag these explicitly when they apply to the workflow being built:

- **Node.js API in workflow context** — `fs`, `path`, `crypto`, `Buffer`, `process`, etc. cannot be used inside `"use workflow"` functions.
- **Missing idempotency for side effects** — Steps that write to databases, send emails, or call external APIs must have an idempotency strategy (idempotency key, upsert, or check-before-write).
- **Over-granular step boundaries** — Each step is persisted and replayed. Don't split a single logical operation into many tiny steps. Group related I/O unless you need independent retry or suspension between operations.
- **Direct stream I/O in workflow context** — `getWritable()` may be called anywhere, but stream reads/writes cannot survive replay. Always perform I/O in steps.
- **`createWebhook()` with a custom token** — Only `createHook()` supports deterministic tokens.
- **`start()` called directly from workflow code** — Must be wrapped in a step.
- **Mutating step inputs without returning** — Pass-by-value means mutations are lost.

## Sample Usage

**Input:** `Build a workflow that ingests a webhook, asks a manager to approve refunds over $500, and streams progress to the UI.`

**Expected behavior:**

1. **Phase 1** proposes: webhook ingress step, approval hook with `approval:${refundId}` token, refund step, notification step, stream progress step — all side effects in `"use step"` functions.
2. **Phase 2** flags: idempotency needed on refund step, compensation plan for refund-then-notification-failure, stream I/O must happen in a step.
3. **Phase 3** decides: `RetryableError` on refund with `maxRetries: 3`, `FatalError` if already processed, idempotency key from `refundId`.
4. **Phase 4** writes: `workflows/refund-approval.ts` with `"use workflow"` orchestrator and `"use step"` functions, plus `__tests__/refund-approval.test.ts` using `resumeWebhook()`, `waitForHook()`/`resumeHook()`, and `run.returnValue` assertions.
5. **Phase 5** self-review confirms: no stream I/O in workflow context, all tokens deterministic, compensation documented, test coverage complete.
