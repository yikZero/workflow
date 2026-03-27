---
name: workflow-approval
description: Design approval workflows with expiry, escalation, idempotency, and operator observability. Triggers on "approval workflow", "workflow-approval", "human approval", or "escalation workflow".
metadata:
  author: Vercel Inc.
  version: '0.1'
user-invocable: true
argument-hint: "[flow or domain]"
---

# workflow-approval

Design human approval workflows with expiry, escalation, and operator signals.

## Scenario Goal

Human approval flows with expiry, escalation, and operator signals.

## Required Patterns

This scenario exercises: hook, sleep, retry, stream.

## Steps

### 1. Read the workflow skill

Read `skills/workflow/SKILL.md` to load the current API truth source.

### 2. Load project context

Read `.workflow-skills/context.json` if present. If missing, run `workflow-teach` first to capture project context.

### 3. Gather approval-specific context

Ask the user:

- Who are the approval actors (manager, director, etc.)?
- What are the timeout windows for each approval tier?
- What escalation path applies when a timeout expires?
- How should the workflow signal approval lifecycle events to operators?

### 4. Route through the skill loop

This scenario automatically routes through the full workflow skill loop:

1. **workflow-teach** — Capture approval rules, timeout rules, and observability requirements into `.workflow-skills/context.json`.
2. **workflow-design** — Emit a `WorkflowBlueprint` to `.workflow-skills/blueprints/approval-expiry-escalation.json` that includes:
   - `createHook` with deterministic token strategy for each approval actor
   - `sleep` suspensions paired with each hook for timeout behavior
   - `invariants` for single-decision guarantees
   - `operatorSignals` for the full approval lifecycle
   - `compensationPlan` (empty for read-only approval flows)
3. **workflow-stress** — Pressure-test the blueprint. The stress stage must verify:
   - Every hook has a paired timeout sleep
   - Idempotency keys exist on all side-effecting steps
   - Escalation paths are covered in test plans
   - Operator signals cover requested, escalated, and decided events
4. **workflow-verify** — Generate test matrices and integration test skeletons using `start`, `getRun`, `waitForHook`, `resumeHook`, `waitForSleep`, `wakeUp`, and `run.returnValue`.

### 5. Emit or patch the blueprint

Write the `WorkflowBlueprint` to `.workflow-skills/blueprints/approval-expiry-escalation.json`.

## Sample Prompts

- `/workflow-approval refund approvals with escalation after 48h`
- `/workflow-approval PO approval routing with director escalation`
- `/workflow-approval content moderation review with timeout`
