---
name: workflow-idempotency
description: Design idempotent workflows where side effects remain safe under retries, replay, and duplicate events. Triggers on "idempotency workflow", "workflow-idempotency", "duplicate safe workflow", or "retry safe workflow".
metadata:
  author: Vercel Inc.
  version: '0.1'
user-invocable: true
argument-hint: "[flow or domain]"
---

# workflow-idempotency

Design side effects that remain safe under retries, replay, and duplicate events.

## Scenario Goal

Side effects that remain safe under retries, replay, and duplicate events.

## Required Patterns

This scenario exercises: retry, compensation, webhook.

## Steps

### 1. Read the workflow skill

Read `skills/workflow/SKILL.md` to load the current API truth source.

### 2. Load project context

Read `.workflow-skills/context.json` if present. If missing, run `workflow-teach` first to capture project context.

### 3. Gather idempotency-specific context

Ask the user:

- Which external events can arrive more than once?
- What side effects (charges, notifications, state changes) must not be duplicated?
- How are idempotency keys derived (order ID, event ID, composite)?
- What compensation is needed if a duplicate slips through?

### 4. Route through the skill loop

This scenario automatically routes through the full workflow skill loop:

1. **workflow-teach** — Capture idempotency requirements, external systems, and compensation rules into `.workflow-skills/context.json`.
2. **workflow-design** — Emit a `WorkflowBlueprint` to `.workflow-skills/blueprints/duplicate-webhook-order.json` that includes:
   - `createWebhook` for external event ingress
   - Idempotency keys on every step with external side effects
   - `compensationPlan` for duplicate-delivery recovery
   - `invariants` for exactly-once processing guarantees
   - `operatorSignals` for duplicate detection tracking
3. **workflow-stress** — Pressure-test the blueprint for duplicate delivery scenarios, replay safety, and idempotency key coverage.
4. **workflow-verify** — Generate test matrices covering normal delivery, duplicate delivery, and replay scenarios.

### 5. Emit or patch the blueprint

Write the `WorkflowBlueprint` to `.workflow-skills/blueprints/duplicate-webhook-order.json`.

## Sample Prompts

- `/workflow-idempotency make duplicate webhook delivery safe`
- `/workflow-idempotency ensure payment charges are never duplicated`
- `/workflow-idempotency protect order processing from event replay`
