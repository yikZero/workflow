---
name: workflow-idempotency
description: Build a durable workflow where side effects must remain safe under retries, replay, and duplicate delivery. Use when the user says "idempotency workflow", "workflow-idempotency", "duplicate", "replay", or "retry safety".
user-invocable: true
argument-hint: "[workflow prompt]"
metadata:
  author: Vercel Inc.
  version: '0.1'
---

# workflow-idempotency

Use this skill when the user wants to build a workflow where external side effects must remain safe under retries, replay, and duplicate delivery. This is a scenario entrypoint that routes into the existing teach → build pipeline with idempotency-specific guardrails.

## Context Capture

If `.workflow.md` exists in the project root, read it and use its context. If it does not exist, run a focused context capture covering these idempotency-specific questions before proceeding:

1. **Duplicate ingress** — "Can the same event arrive more than once (e.g. webhook at-least-once delivery, queue retry)? What entity ID anchors deduplication?"
2. **Replay safety** — "Which steps produce external side effects that would be harmful if replayed (charges, emails, reservations)?"
3. **Idempotency key strategy** — "What stable identifiers are available to derive idempotency keys for each side-effecting step?"
4. **External provider support** — "Do downstream APIs accept idempotency keys natively, or must the workflow enforce deduplication itself?"
5. **Compensation requirements** — "If a step fails after earlier steps committed with idempotency keys, what compensation is needed?"
6. **Observability** — "What must operators see in logs for duplicate detection, idempotency cache hits, and replay events?"

Save the answers into `.workflow.md` following the same 8-section format used by `workflow-teach`.

## Required Design Constraints

When building an idempotency-safe workflow, the following constraints are non-negotiable:

### Duplicate delivery detection

The workflow must detect and safely handle duplicate event delivery. The deduplication strategy must use a stable identifier from the ingress payload (e.g. Stripe event ID, Shopify order ID, message queue deduplication ID). Duplicate deliveries after successful processing must be treated as `FatalError` (skip, do not reprocess).

### Stable idempotency keys on every side-effecting step

Every step that produces an external side effect must use an idempotency key derived from a stable, unique identifier — never from timestamps or random values. Examples:

- Payment charge: `payment:${eventId}`
- Inventory reservation: `inventory:${eventId}`
- Notification: `notify:${eventId}`
- Refund: `refund:${eventId}`

### Replay safety verification

The workflow must be safe to replay from any point in the event log. This means:

- Steps with idempotency keys produce the same result on replay (no duplicate side effects)
- Steps without external side effects (pure computation) are naturally replay-safe
- Steps that read external state must tolerate stale reads from replay

### Compensation with idempotency keys

If a step fails after earlier steps committed with idempotency keys, compensation steps must also use stable idempotency keys. Compensation steps must use `RetryableError` with high `maxRetries` — compensation must eventually succeed.

## Build Process

Follow the same six-phase interactive build process as `workflow-build`:

1. **Propose step boundaries** — identify `"use workflow"` orchestrator vs `"use step"` functions, deduplication check, side-effecting steps with idempotency keys, compensation steps
2. **Flag relevant traps** — run the stress checklist with special attention to idempotency keys on every side-effecting step, duplicate ingress handling, and replay safety
3. **Decide failure modes** — `FatalError` for duplicate/already-processed, `RetryableError` for transient failures, compensation plan for each irreversible step
4. **Write code + tests** — produce workflow file and integration tests
5. **Self-review** — re-run the stress checklist against generated code
6. **Verification summary** — emit the verification artifact and `verification_plan_ready` summary

### Required test coverage

Integration tests must exercise:

- **Happy path** — event received, all steps succeed with idempotency keys
- **Duplicate event** — second delivery is detected and skipped (no-op)
- **Replay safety** — replayed steps do not produce duplicate side effects
- **Compensation path** — downstream step fails after earlier step committed, compensation executes with its own idempotency keys

## Anti-Patterns

Flag these explicitly when they appear in the workflow:

- **Missing idempotency key on a side-effecting step** — every external call must have a stable idempotency key to survive replay
- **Timestamp or random idempotency keys** — keys must be derived from stable entity identifiers; `Date.now()` or `crypto.randomUUID()` break on replay
- **Missing deduplication on ingress** — without duplicate detection, at-least-once delivery causes double-processing
- **Idempotency key reuse across different operations** — each step must have a distinct key namespace (e.g. `payment:${id}` vs `inventory:${id}`)
- **Missing compensation idempotency keys** — compensation steps need their own stable keys to survive replay
- **Node.js APIs in workflow context** — `fs`, `crypto`, `Buffer`, etc. cannot be used inside `"use workflow"` functions
- **Direct stream I/O in workflow context** — `getWritable()` may be called in workflow context, but actual writes must happen in steps
- **`start()` called directly from workflow code** — must be wrapped in a step

## Inputs

Always read these before producing output:

1. **`skills/workflow/SKILL.md`** — the authoritative API truth source
2. **`.workflow.md`** — project-specific context (if present)

## Verification Contract

This skill terminates with the same verification contract as `workflow-build`. The final output must include:

1. A **Verification Artifact** — fenced JSON block with `contractVersion`, `blueprintName`, `files`, `testMatrix`, `runtimeCommands`, and `implementationNotes`
2. A **Verification Summary** — single-line JSON: `{"event":"verification_plan_ready","blueprintName":"<name>","fileCount":<n>,"testCount":<n>,"runtimeCommandCount":<n>,"contractVersion":"1"}`

## Sample Usage

**Input:** `/workflow-idempotency Make duplicate Stripe checkout events safe without double-charging or double-emailing.`

**Expected behavior:**

1. Reads `.workflow.md` if present; otherwise runs focused context capture
2. Proposes: deduplication check step by Stripe event ID, payment charge step with `payment:${eventId}` idempotency key, inventory step with `inventory:${eventId}` key, confirmation email step with `notify:${eventId}` key, compensation refund step with `refund:${eventId}` key
3. Flags: idempotency key required on every side-effecting step, duplicate ingress detection, replay safety, compensation keys for refund path
4. Writes: `workflows/stripe-checkout.ts` + `workflows/stripe-checkout.integration.test.ts`
5. Tests cover: happy path, duplicate event no-op, replay safety verification, compensation with idempotency keys on failure
6. Emits verification artifact and `verification_plan_ready` summary
