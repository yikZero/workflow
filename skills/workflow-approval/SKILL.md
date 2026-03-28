---
name: workflow-approval
description: Build a durable approval workflow with hook-based human-in-the-loop, expiry via sleep, and escalation. Use when the user says "approval workflow", "workflow-approval", "approval escalation", "human approval", or "approval with timeout".
user-invocable: true
argument-hint: "[workflow prompt]"
metadata:
  author: Vercel Inc.
  version: '0.1'
---

# workflow-approval

Use this skill when the user wants to build a workflow that includes human approval, expiry timeouts, or escalation logic. This is a scenario entrypoint that routes into the existing teach → build pipeline with approval-specific guardrails.

## Context Capture

If `.workflow.md` exists in the project root, read it and use its context. If it does not exist, run a focused context capture covering these approval-specific questions before proceeding:

1. **Approval actors** — "Who can approve, and is there an escalation chain?"
2. **Timeout/expiry rules** — "How long does each approver have before the request escalates or auto-rejects?"
3. **Hook token strategy** — "What entity ID should anchor the deterministic hook token (e.g. `approval:${documentId}`)?"
4. **Side effect safety** — "Are notification emails safe to retry? What about the final action after approval?"
5. **Compensation requirements** — "If the approved action fails after approval is granted, what happens?"
6. **Observability** — "What must operators see in logs for the approval lifecycle?"

Save the answers into `.workflow.md` following the same 8-section format used by `workflow-teach`.

## Required Design Constraints

When building an approval workflow, the following constraints are non-negotiable:

### Deterministic hook tokens

Every `createHook()` call must use a deterministic token derived from a stable entity identifier. Example: `createHook<Decision>(\`approval:\${orderId}\`)`. Never use random or timestamp-based tokens for approval hooks.

### Expiry via `sleep()`

Every approval step must be paired with a `sleep()` timeout. Use `Promise.race([hook, sleep("48h")])` to race the approval against expiry. When the sleep wins, the workflow must either escalate or auto-reject — never silently ignore the timeout.

### Escalation behavior

When an approval times out and an escalation chain exists:

- Create a new hook with a distinct deterministic token (e.g. `escalation:${orderId}`)
- Pair it with its own sleep timeout
- If the escalation also times out, auto-reject and notify the requester

### Notification idempotency

Every notification step must use an idempotency key derived from the entity ID (e.g. `notify:${orderId}`). Notification emails are typically safe to retry but must not be sent multiple times for the same event.

## Build Process

Follow the same six-phase interactive build process as `workflow-build`:

1. **Propose step boundaries** — identify `"use workflow"` orchestrator vs `"use step"` functions, suspension points (hooks + sleeps), and stream requirements
2. **Flag relevant traps** — run the stress checklist with special attention to hook token strategy, sleep/expiry pairing, and escalation logic
3. **Decide failure modes** — `FatalError` vs `RetryableError` for each step, with approval timeout treated as a domain-level permanent outcome (not an error)
4. **Write code + tests** — produce workflow file and integration tests
5. **Self-review** — re-run the stress checklist against generated code
6. **Verification summary** — emit the verification artifact and `verification_plan_ready` summary

### Required test coverage

Integration tests must exercise:

- **Happy path** — approver responds before timeout
- **Timeout → escalation** — primary approver times out, escalation approver responds
- **Full timeout → auto-rejection** — all approvers time out
- Each test must use `waitForHook`, `resumeHook`, `waitForSleep`, and `wakeUp` from `@workflow/vitest`

## Anti-Patterns

Flag these explicitly when they appear in the approval workflow:

- **Random or timestamp-based hook tokens** — approval hooks must be deterministic and collision-free across concurrent runs
- **Missing sleep pairing** — every hook must race against a sleep timeout; an unguarded hook can suspend the workflow indefinitely
- **Escalation without a distinct token** — reusing the same hook token for escalation and primary approval causes collisions
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

**Input:** `/workflow-approval Build an approval workflow for purchase orders over $5,000 with manager approval, director escalation after 48h, and auto-rejection after 24h.`

**Expected behavior:**

1. Reads `.workflow.md` if present; otherwise runs focused context capture
2. Proposes: webhook/API ingress step, manager approval hook with `approval:po-${poNumber}` token + 48h sleep, director escalation hook with `escalation:po-${poNumber}` token + 24h sleep, notification steps with idempotency keys, status stream
3. Flags: deterministic tokens required, sleep pairing on both hooks, escalation needs distinct token
4. Writes: `workflows/purchase-approval.ts` + `workflows/purchase-approval.integration.test.ts`
5. Tests cover: manager-approves, manager-timeout → director-approves, full-timeout → auto-rejection — using `waitForHook`, `resumeHook`, `waitForSleep`, `wakeUp`
6. Emits verification artifact and `verification_plan_ready` summary
