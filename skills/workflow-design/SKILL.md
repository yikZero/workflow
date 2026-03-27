---
name: workflow-design
description: Design a workflow before writing code. Reads project context and produces a machine-readable blueprint matching WorkflowBlueprint. Use when the user wants to plan step boundaries, suspensions, streams, and tests for a new workflow. Triggers on "design workflow", "plan workflow", "workflow blueprint", or "workflow-design".
metadata:
  author: Vercel Inc.
  version: '0.4'
---

# workflow-design

Use this skill when the user wants to design a workflow before writing code.

## Inputs

Always read these before producing output:

1. **`skills/workflow/SKILL.md`** — the authoritative API truth source. Do not duplicate its guidance; reference it for all runtime behavior questions.
2. **`.workflow-skills/context.json`** — if it exists, use the captured project context to inform step boundaries, external system integration, and anti-pattern selection. Carry forward persisted `businessInvariants`, `compensationRules`, and `observabilityRequirements` into the blueprint rather than producing a generic runtime-only plan. When `approvalRules`, `timeoutRules`, or `idempotencyRequirements` are present in context, reflect them in the blueprint's suspensions, failure model, and `invariants` array respectively.
3. **`lib/ai/workflow-blueprint.ts`** — the `WorkflowBlueprint` type contract. Every blueprint you produce must conform to this type exactly. In addition to the base shape, every blueprint JSON block must include `invariants`, `compensationPlan`, and `operatorSignals` arrays.

## Output Sections

Output exactly these sections in order:

### `## Workflow Summary`

A 2-4 sentence plain-English description of what the workflow does, why it needs durability, and what suspension points it uses.

### `## Blueprint`

A fenced `json` block containing a single JSON object that matches the `WorkflowBlueprint` type from `lib/ai/workflow-blueprint.ts`. This must be valid, parseable JSON with no comments or trailing commas.

Every blueprint JSON block must include these three policy arrays in addition to the base shape:

- **`invariants`** — business rules that must hold true throughout the workflow's lifetime. Populate from `businessInvariants` and `idempotencyRequirements` in `.workflow-skills/context.json`. If no context file exists, derive invariants from the workflow's stated goal and side effects.
- **`compensationPlan`** — for each irreversible side effect, state what compensation action runs if a later step fails. Populate from `compensationRules` in context. If a step has no irreversible side effects, omit it from the plan.
- **`operatorSignals`** — what operators must be able to observe in logs and streams at runtime. Populate from `observabilityRequirements` in context. At minimum, include a signal for every suspension point and every error classification.

The blueprint must be written to `.workflow-skills/blueprints/<workflow-name>.json`.

### `## Failure Model`

For each step, explain:
- What happens on transient failure (retry behavior)
- What happens on permanent failure (`FatalError` vs `RetryableError`)
- Whether a rollback or compensation step is needed
- Idempotency strategy for side effects — every irreversible side effect must include an idempotency rationale explaining why retrying or replaying that step is safe (e.g., idempotency key, upsert, check-before-write, or external deduplication). If the side effect is not naturally idempotent, explain when compensation is required and reference the corresponding entry in `compensationPlan`.

When `approvalRules` or `timeoutRules` are present in `.workflow-skills/context.json`, the Failure Model must address approval expiry behavior (what happens when an approval times out) and timeout-triggered compensation (what side effects are rolled back when a timeout fires).

### `## Test Strategy`

Map each blueprint test entry to concrete test helpers from `@workflow/vitest` and `workflow/api`. Explain what each test verifies and which suspension points it exercises.

## Hard Rules

These rules are non-negotiable. Violating any of them means the blueprint is incorrect:

1. **Workflow functions orchestrate only.** A `"use workflow"` function must not perform I/O, access Node.js APIs, read/write streams, call databases, or invoke external services directly.
2. **All side effects live in `"use step"`.** Every I/O operation — SDK calls, database queries, filesystem access, HTTP requests, external API calls — must be inside a `"use step"` function.
3. **`createHook()` may use deterministic tokens.** When a hook needs a stable, predictable token (e.g. `approval:${documentId}`), use `createHook()` with a deterministic token string.
4. **`createWebhook()` may NOT use deterministic tokens.** Webhooks generate their own tokens. Do not pass custom tokens to `createWebhook()`.
5. **Stream I/O happens in steps.** `getWritable()` may be called in workflow or step context, but any direct stream interaction must be inside `"use step"` functions. The workflow orchestrator cannot hold stream I/O across replay boundaries.
6. **`start()` inside a workflow must be wrapped in a step.** Starting a child workflow is a side effect requiring full Node.js access. Wrap it in a `"use step"` function.
7. **Return mutated values from steps.** Step functions use pass-by-value semantics. If you modify data inside a step, `return` the new value and reassign it in the calling workflow. Mutations to the input object are lost after replay.
8. **Recommend `FatalError` or `RetryableError` intentionally.** Every error classification in the blueprint must have a clear rationale. `FatalError` means "do not retry, this is a permanent failure." `RetryableError` means "transient issue, try again." Never recommend one vaguely.

## Required Anti-Pattern Callouts

Every blueprint must explicitly note which of these anti-patterns it avoids (in the `antiPatternsAvoided` array):

- **Node.js API in workflow context** — `fs`, `path`, `crypto`, `Buffer`, `process`, etc. cannot be used inside `"use workflow"` functions.
- **Missing idempotency for side effects** — Steps that write to databases, send emails, or call external APIs must have an idempotency strategy (idempotency key, upsert, or check-before-write).
- **Over-granular step boundaries** — Each step is persisted and replayed. Don't split a single logical operation into many tiny steps. Group related I/O unless you need independent retry or suspension between operations.
- **Direct stream I/O in workflow context** — `getWritable()` may be called anywhere, but stream reads/writes cannot survive replay. Always perform I/O in steps.
- **`createWebhook()` with a custom token** — Only `createHook()` supports deterministic tokens.
- **`start()` called directly from workflow code** — Must be wrapped in a step.
- **Mutating step inputs without returning** — Pass-by-value means mutations are lost.

## Sample Usage

**Input:** `Design a workflow that ingests a webhook, asks a manager to approve refunds over $500, and streams progress to the UI.`

**Expected output:** A JSON blueprint containing:
- A webhook ingress step
- A deterministic `createHook()` approval suspension with token like `refund-approval:${refundId}`
- A step that uses `getWritable()` to stream progress
- `RetryableError` on the payment refund step with `maxRetries: 3`
- `FatalError` if the refund is already processed
- A test plan using both `resumeWebhook()` and `resumeHook()` helpers
- `antiPatternsAvoided` listing all relevant patterns from above
- `invariants` including at minimum `"refunds must be idempotent — duplicate refund requests for the same order must not double-credit"` and any `businessInvariants` from context
- `compensationPlan` stating that if the refund API call succeeds but a later notification step fails, the refund stands (no reversal) but a dead-letter entry is created for retry
- `operatorSignals` including `"log refund.initiated with orderId and amount"`, `"log approval.requested with refundId and approver"`, `"stream progress updates via getWritable()"`, and `"log refund.completed or refund.failed with final status"`

## Next Step

After generating a blueprint, run `workflow-stress` before `workflow-verify` when the design includes hooks, webhooks, sleep, streams, retries, or child workflows.
