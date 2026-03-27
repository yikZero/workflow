---
name: workflow-design
description: Design a workflow before writing code. Reads project context and produces a machine-readable blueprint matching WorkflowBlueprint. Use when the user wants to plan step boundaries, suspensions, streams, and tests for a new workflow. Triggers on "design workflow", "plan workflow", "workflow blueprint", or "workflow-design".
metadata:
  author: Vercel Inc.
  version: '0.1'
---

# workflow-design

Use this skill when the user wants to design a workflow before writing code.

## Inputs

Always read these before producing output:

1. **`skills/workflow/SKILL.md`** — the authoritative API truth source. Do not duplicate its guidance; reference it for all runtime behavior questions.
2. **`.workflow-skills/context.json`** — if it exists, use the captured project context to inform step boundaries, external system integration, and anti-pattern selection.
3. **`lib/ai/workflow-blueprint.ts`** — the `WorkflowBlueprint` type contract. Every blueprint you produce must conform to this type exactly.

## Output Sections

Output exactly these sections in order:

### `## Workflow Summary`

A 2-4 sentence plain-English description of what the workflow does, why it needs durability, and what suspension points it uses.

### `## Blueprint`

A fenced `json` block containing a single JSON object that matches the `WorkflowBlueprint` type from `lib/ai/workflow-blueprint.ts`. This must be valid, parseable JSON with no comments or trailing commas.

The blueprint must be written to `.workflow-skills/blueprints/<workflow-name>.json`.

### `## Failure Model`

For each step, explain:
- What happens on transient failure (retry behavior)
- What happens on permanent failure (`FatalError` vs `RetryableError`)
- Whether a rollback or compensation step is needed
- Idempotency strategy for side effects

### `## Test Strategy`

Map each blueprint test entry to concrete test helpers from `@workflow/vitest` and `workflow/api`. Explain what each test verifies and which suspension points it exercises.

## Hard Rules

These rules are non-negotiable. Violating any of them means the blueprint is incorrect:

1. **Workflow functions orchestrate only.** A `"use workflow"` function must not perform I/O, access Node.js APIs, read/write streams, call databases, or invoke external services directly.
2. **All side effects live in `"use step"`.** Every I/O operation — SDK calls, database queries, filesystem access, HTTP requests, external API calls — must be inside a `"use step"` function.
3. **`createHook()` may use deterministic tokens.** When a hook needs a stable, predictable token (e.g. `approval:${documentId}`), use `createHook()` with a deterministic token string.
4. **`createWebhook()` may NOT use deterministic tokens.** Webhooks generate their own tokens. Do not pass custom tokens to `createWebhook()`.
5. **Stream I/O happens in steps.** `getWritable()` and any stream consumption must be inside `"use step"` functions. The workflow orchestrator cannot hold streams open across replay boundaries.
6. **`start()` inside a workflow must be wrapped in a step.** Starting a child workflow is a side effect requiring full Node.js access. Wrap it in a `"use step"` function.
7. **Return mutated values from steps.** Step functions use pass-by-value semantics. If you modify data inside a step, `return` the new value and reassign it in the calling workflow. Mutations to the input object are lost after replay.
8. **Recommend `FatalError` or `RetryableError` intentionally.** Every error classification in the blueprint must have a clear rationale. `FatalError` means "do not retry, this is a permanent failure." `RetryableError` means "transient issue, try again." Never recommend one vaguely.

## Required Anti-Pattern Callouts

Every blueprint must explicitly note which of these anti-patterns it avoids (in the `antiPatternsAvoided` array):

- **Node.js API in workflow context** — `fs`, `path`, `crypto`, `Buffer`, `process`, etc. cannot be used inside `"use workflow"` functions.
- **Missing idempotency for side effects** — Steps that write to databases, send emails, or call external APIs must have an idempotency strategy (idempotency key, upsert, or check-before-write).
- **Over-granular step boundaries** — Each step is persisted and replayed. Don't split a single logical operation into many tiny steps. Group related I/O unless you need independent retry or suspension between operations.
- **Stream reads/writes in workflow context** — Streams cannot survive replay. Always use steps.
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
