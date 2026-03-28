---
name: workflow-timeout
description: Build a durable workflow whose correctness depends on expiry, wake-up behavior, and timeout outcomes. Use when the user says "timeout workflow", "workflow-timeout", "expiry", "sleep", or "wake up".
user-invocable: true
argument-hint: "[workflow prompt]"
metadata:
  author: Vercel Inc.
  version: '0.1'
---

# workflow-timeout

Use this skill when the user wants to build a workflow whose correctness depends on time-based expiry, suspension via `sleep`, and deterministic wake-up via `wakeUp`. This is a scenario entrypoint that routes into the existing teach → build pipeline with timeout-specific guardrails.

## Context Capture

If `.workflow.md` exists in the project root, read it and use its context. If it does not exist, run a focused context capture covering these timeout-specific questions before proceeding:

1. **Timeout triggers** — "What events or durations trigger a timeout? Is each timeout a fixed duration or computed from business rules?"
2. **Timeout outcomes** — "What happens when a timeout fires — escalation, auto-rejection, cancellation, or something else?"
3. **Sleep/wake-up pairing** — "Which suspension points use `sleep()`, and can any be woken early via `wakeUp`?"
4. **Hook/sleep races** — "Are there points where a hook (human action) races against a sleep (timeout)? What wins if both resolve?"
5. **Cascading timeouts** — "Does the workflow have multiple timeout tiers (e.g. 48h then 24h)? What is the escalation chain?"
6. **Observability** — "What must operators see in logs for timeout lifecycle events (sleep started, woken early, expired)?"

Save the answers into `.workflow.md` following the same 8-section format used by `workflow-teach`.

## Required Design Constraints

When building a timeout workflow, the following constraints are non-negotiable:

### Every suspension must have a bounded lifetime

Every `sleep()` call must have an explicit duration. Never create an unbounded suspension — a workflow that sleeps forever is a workflow that never completes.

### Sleep/wake-up correctness

Use `sleep()` to suspend the workflow for a fixed duration. Use `waitForSleep` in tests to capture the sleep correlation ID, then `wakeUp` to advance past the sleep without waiting for real time. Every test that exercises a timeout path must use `waitForSleep` and `wakeUp`.

### Hook/sleep races via `Promise.race`

When a human action (hook) races against a timeout (sleep), use `createHook()` for the human action and `sleep()` for the timeout, then race them with `Promise.race([hook, sleep("duration")])`. Check the result:

- If the hook resolves first, the human responded before the timeout
- If the sleep resolves first (returns `undefined`), the timeout fired

Never use separate branches or polling to detect timeout — always race.

### Timeout as a domain outcome

A timeout is a normal workflow outcome, not an error. Do not throw an error when a timeout fires. Instead, treat the timeout branch as a first-class code path with its own business logic (escalation, auto-rejection, cancellation).

### Deterministic hook tokens for timed actions

When a hook races against a sleep, the hook must use a deterministic token derived from a stable entity identifier (e.g. `approval:${requestId}`). This ensures the hook is collision-free across concurrent workflow runs.

## Build Process

Follow the same six-phase interactive build process as `workflow-build`:

1. **Propose step boundaries** — identify `"use workflow"` orchestrator vs `"use step"` functions, suspension points (sleep + hook races), and escalation tiers
2. **Flag relevant traps** — run the stress checklist with special attention to sleep/wake-up correctness, hook/sleep races, and cascading timeout tiers
3. **Decide failure modes** — `FatalError` vs `RetryableError` for each step, with timeout treated as a domain-level permanent outcome (not an error)
4. **Write code + tests** — produce workflow file and integration tests
5. **Self-review** — re-run the stress checklist against generated code
6. **Verification summary** — emit the verification artifact and `verification_plan_ready` summary

### Required test coverage

Integration tests must exercise:

- **Happy path** — action completes before any timeout fires
- **First timeout** — primary timeout fires, escalation or fallback logic runs
- **Full timeout chain** — all timeouts expire, workflow reaches terminal state (auto-reject, cancel, etc.)
- Each test must use `waitForHook`, `resumeHook`, `waitForSleep`, and `wakeUp` from `@workflow/vitest`

## Anti-Patterns

Flag these explicitly when they appear in the timeout workflow:

- **Unbounded sleep** — every `sleep()` must have an explicit duration; missing durations suspend the workflow forever
- **Missing sleep pairing** — every hook must race against a sleep timeout; an unguarded hook can suspend the workflow indefinitely
- **Timeout treated as an error** — timeouts are domain outcomes, not exceptions; do not throw when a sleep wins a race
- **Polling instead of `Promise.race`** — use `Promise.race([hook, sleep])` to detect timeout; never poll or use setInterval
- **Non-deterministic hook tokens** — hook tokens in timed races must be deterministic and derived from stable entity identifiers
- **Tests without `waitForSleep`/`wakeUp`** — timeout tests that rely on real time are flaky; always use test helpers
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

**Input:** `/workflow-timeout Wait 24h for manager acknowledgement, escalate for another 24h, then auto-close.`

**Expected behavior:**

1. Reads `.workflow.md` if present; otherwise runs focused context capture
2. Proposes: notification step, manager hook with `ack:${requestId}` token + 24h sleep, escalation notification step, escalation hook with `escalation:${requestId}` token + 24h sleep, auto-close step
3. Flags: every hook must race against a sleep, timeout is a domain outcome not an error, deterministic tokens required, `waitForSleep`/`wakeUp` required in tests
4. Writes: `workflows/manager-ack.ts` + `workflows/manager-ack.integration.test.ts`
5. Tests cover: manager responds before timeout, manager timeout → escalation → escalation responds, full timeout → auto-close — using `waitForHook`, `resumeHook`, `waitForSleep`, `wakeUp`
6. Emits verification artifact and `verification_plan_ready` summary
