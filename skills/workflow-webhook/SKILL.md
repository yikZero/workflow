---
name: workflow-webhook
description: Build a durable webhook ingestion workflow with duplicate-delivery handling, idempotency keys, and compensation. Use when the user says "webhook workflow", "workflow-webhook", "webhook ingestion", "duplicate webhook", or "at-least-once delivery".
user-invocable: true
argument-hint: "[workflow prompt]"
metadata:
  author: Vercel Inc.
  version: '0.1'
---

# workflow-webhook

Use this skill when the user wants to build a workflow that ingests external webhooks with at-least-once delivery guarantees. This is a scenario entrypoint that routes into the existing teach → build pipeline with webhook-specific guardrails.

## Context Capture

If `.workflow.md` exists in the project root, read it and use its context. If it does not exist, run a focused context capture covering these webhook-specific questions before proceeding:

1. **Webhook source** — "What system sends the webhook, and does it guarantee at-least-once or exactly-once delivery?"
2. **Duplicate handling** — "How should duplicate deliveries be detected and handled? What entity ID anchors deduplication?"
3. **Idempotency strategy** — "Which downstream operations need idempotency keys, and what stable identifiers are available?"
4. **Response timeout** — "How quickly must the webhook endpoint respond before the sender retries?"
5. **Compensation requirements** — "If a downstream step fails after earlier steps have committed side effects, what must be undone?"
6. **Observability** — "What must operators see in logs for webhook receipt, deduplication, and step progress?"

Save the answers into `.workflow.md` following the same 8-section format used by `workflow-teach`.

## Required Design Constraints

When building a webhook ingestion workflow, the following constraints are non-negotiable:

### Duplicate-delivery handling

The workflow must detect and safely handle duplicate webhook deliveries. The deduplication strategy must use a stable identifier from the webhook payload (e.g. Shopify order ID, Stripe event ID). Duplicate deliveries after successful processing must be treated as `FatalError` (skip, do not reprocess).

### Stable idempotency keys

Every step with external side effects must use an idempotency key derived from a stable, unique identifier — never from timestamps or random values. Examples:

- Payment charge: `payment:${orderId}`
- Inventory reservation: `inventory:${orderId}`
- Notification: `notify:${orderId}`

### Webhook response mode selection

Choose the correct webhook response mode:

- **`static`** — use when the webhook sender only needs an acknowledgment. The endpoint returns a fixed response immediately without blocking on workflow completion. This is the correct default for most webhook ingestion patterns.
- **`manual`** — use only when the webhook response must include data computed by the workflow (rare for ingestion patterns).

The response timeout from the webhook sender (e.g. Shopify's 30-second limit) must be respected. Long-running processing must happen after the webhook response is sent.

### Compensation when downstream steps fail

If a step fails after prior steps have committed irreversible side effects, a compensation step must undo the committed work. Example: if inventory reservation fails after payment has been charged, the workflow must refund the payment.

Compensation steps must:

- Use their own idempotency keys (e.g. `refund:${orderId}`)
- Be `RetryableError` with high `maxRetries` — compensation must eventually succeed
- Execute before the workflow terminates with an error

## Build Process

Follow the same six-phase interactive build process as `workflow-build`:

1. **Propose step boundaries** — identify `"use workflow"` orchestrator vs `"use step"` functions, deduplication check, downstream steps, compensation steps
2. **Flag relevant traps** — run the stress checklist with special attention to idempotency keys, webhook response mode, and compensation strategy
3. **Decide failure modes** — `FatalError` for duplicate/already-processed, `RetryableError` for transient downstream failures, compensation plan for each irreversible step
4. **Write code + tests** — produce workflow file and integration tests
5. **Self-review** — re-run the stress checklist against generated code
6. **Verification summary** — emit the verification artifact and `verification_plan_ready` summary

### Required test coverage

Integration tests must exercise:

- **Happy path** — webhook received, all steps succeed
- **Duplicate webhook** — second delivery is detected and skipped (no-op)
- **Compensation path** — downstream step fails after earlier step committed, compensation executes
- **Idempotency verification** — replayed steps do not produce duplicate side effects

## Anti-Patterns

Flag these explicitly when they appear in the webhook workflow:

- **Missing deduplication on webhook ingress** — without duplicate detection, at-least-once delivery causes double-processing
- **Timestamp or random idempotency keys** — keys must be derived from stable entity identifiers to survive replay
- **Wrong webhook response mode** — using `manual` when `static` suffices blocks the sender; using `static` when computed data is needed returns stale responses
- **Missing compensation for irreversible side effects** — if payment is charged and inventory fails, the payment must be refunded
- **Node.js APIs in workflow context** — `fs`, `crypto`, `Buffer`, etc. cannot be used inside `"use workflow"` functions
- **Direct stream I/O in workflow context** — `getWritable()` may be called in workflow context, but actual writes must happen in steps
- **`createWebhook()` with a custom token** — `createWebhook()` does not accept custom tokens; only `createHook()` supports deterministic tokens

## Inputs

Always read these before producing output:

1. **`skills/workflow/SKILL.md`** — the authoritative API truth source
2. **`.workflow.md`** — project-specific context (if present)

## Verification Contract

This skill terminates with the same verification contract as `workflow-build`. The final output must include:

1. A **Verification Artifact** — fenced JSON block with `contractVersion`, `blueprintName`, `files`, `testMatrix`, `runtimeCommands`, and `implementationNotes`
2. A **Verification Summary** — single-line JSON: `{"event":"verification_plan_ready","blueprintName":"<name>","fileCount":<n>,"testCount":<n>,"runtimeCommandCount":<n>,"contractVersion":"1"}`

## Sample Usage

**Input:** `/workflow-webhook Build a workflow that processes Shopify order webhooks with at-least-once delivery, charges payment, reserves inventory, and sends confirmation — without double-charging.`

**Expected behavior:**

1. Reads `.workflow.md` if present; otherwise runs focused context capture
2. Proposes: deduplication check step, payment charge step with `payment:${orderId}` idempotency key, inventory reservation step with `inventory:${orderId}` key, compensation refund step with `refund:${orderId}` key, confirmation email step, webhook response mode `static`
3. Flags: idempotency required on every side-effecting step, compensation plan for payment-then-inventory-failure, 30-second webhook response timeout
4. Writes: `workflows/shopify-order.ts` + `workflows/shopify-order.integration.test.ts`
5. Tests cover: happy path, duplicate webhook no-op, inventory failure triggering refund — verifying idempotency keys prevent double-charges
6. Emits verification artifact and `verification_plan_ready` summary
