---
name: workflow-saga
description: Build a durable saga workflow with explicit compensation for partial success. Use when the user says "saga workflow", "workflow-saga", "compensation", "rollback", or "partial failure".
user-invocable: true
argument-hint: "[workflow prompt]"
metadata:
  author: Vercel Inc.
  version: '0.1'
---

# workflow-saga

Use this skill when the user wants to build a workflow where multiple steps produce irreversible side effects and partial failure requires explicit compensation. This is a scenario entrypoint that routes into the existing teach → build pipeline with saga-specific guardrails.

## Context Capture

If `.workflow.md` exists in the project root, read it and use its context. If it does not exist, run a focused context capture covering these saga-specific questions before proceeding:

1. **Side-effecting steps** — "Which steps produce irreversible external effects (payments, reservations, notifications)?"
2. **Compensation ordering** — "When a later step fails, which earlier effects must be undone, and in what order?"
3. **Compensation idempotency** — "Can each compensation action be retried safely? What idempotency key anchors each undo?"
4. **Partial success semantics** — "After compensation, does the workflow terminate with an error or return a partial-success status?"
5. **Forward-recovery option** — "Are there any steps where retrying forward is safer than compensating backward?"
6. **Observability** — "What must operators see in logs when compensation triggers?"

Save the answers into `.workflow.md` following the same 8-section format used by `workflow-teach`.

## Required Design Constraints

When building a saga workflow, the following constraints are non-negotiable:

### Compensation for every irreversible step

Every step that commits an irreversible side effect must have a corresponding compensation step. The compensation step must undo the effect completely or leave the system in a known-safe state. Map each forward step to its compensator before writing code.

### Compensation ordering

Compensation steps must execute in reverse order of the forward steps that succeeded. If step A then step B succeeded but step C fails, compensate B first, then A.

### Compensation idempotency keys

Every compensation step must use an idempotency key derived from a stable entity identifier — never from timestamps or random values. Examples:

- Payment refund: `refund:${orderId}`
- Inventory release: `release:${orderId}`
- Reservation cancel: `cancel:${reservationId}`

### Compensation must eventually succeed

Compensation steps must use `RetryableError` with high `maxRetries`. A failed compensation leaves the system in an inconsistent state. Never use `FatalError` for compensation steps.

### Forward steps use FatalError to trigger compensation

When a forward step encounters a permanent failure that requires compensation (e.g. out-of-stock), it must throw `FatalError`. The workflow orchestrator catches the `FatalError` and runs the compensation chain before re-throwing.

## Build Process

Follow the same six-phase interactive build process as `workflow-build`:

1. **Propose step boundaries** — identify `"use workflow"` orchestrator vs `"use step"` functions, forward steps, and compensation steps
2. **Flag relevant traps** — run the stress checklist with special attention to compensation ordering, idempotency keys, and partial-failure semantics
3. **Decide failure modes** — `FatalError` for permanent forward failures that trigger compensation, `RetryableError` for transient failures, compensation steps always `RetryableError` with high retry count
4. **Write code + tests** — produce workflow file and integration tests
5. **Self-review** — re-run the stress checklist against generated code
6. **Verification summary** — emit the verification artifact and `verification_plan_ready` summary

### Required test coverage

Integration tests must exercise:

- **Happy path** — all forward steps succeed, no compensation needed
- **Compensation path** — a later step fails after earlier steps committed, compensation executes in reverse order
- **Compensation idempotency** — replayed compensation steps do not produce duplicate side effects

## Anti-Patterns

Flag these explicitly when they appear in the saga workflow:

- **Missing compensation for an irreversible step** — every committed side effect must have an undo path
- **Wrong compensation order** — compensations must run in reverse order of committed forward steps
- **FatalError in a compensation step** — compensation must use `RetryableError` with high retries; a fatal compensation leaves the system inconsistent
- **Timestamp or random idempotency keys** — keys must be derived from stable entity identifiers to survive replay
- **Compensation that depends on uncommitted state** — each compensation step must be self-contained; it cannot assume later forward steps ran
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

**Input:** `/workflow-saga Reserve inventory, charge payment, create shipment, and refund if shipment booking fails.`

**Expected behavior:**

1. Reads `.workflow.md` if present; otherwise runs focused context capture
2. Proposes: inventory reservation step with `inventory:${orderId}` key, payment charge step with `payment:${orderId}` key, shipment booking step with `shipment:${orderId}` key, compensation steps: cancel shipment, refund payment, release inventory — each with idempotency keys
3. Flags: compensation ordering (reverse of forward), idempotency on every step, FatalError for permanent shipment failure triggers compensation
4. Writes: `workflows/order-saga.ts` + `workflows/order-saga.integration.test.ts`
5. Tests cover: happy path, shipment failure triggering payment refund and inventory release — verifying compensation order and idempotency
6. Emits verification artifact and `verification_plan_ready` summary
