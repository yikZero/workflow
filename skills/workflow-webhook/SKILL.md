---
name: workflow-webhook
description: Design webhook ingress workflows that survive duplicate delivery and partial failure. Triggers on "webhook workflow", "workflow-webhook", "webhook ingress", or "external event workflow".
metadata:
  author: Vercel Inc.
  version: '0.1'
user-invocable: true
argument-hint: "[flow or domain]"
---

# workflow-webhook

Design external ingress flows that survive duplicate delivery and partial failure.

## Scenario Goal

External ingress flows that survive duplicate delivery and partial failure.

## Required Patterns

This scenario exercises: webhook, retry, compensation.

## Steps

### 1. Read the workflow skill

Read `skills/workflow/SKILL.md` to load the current API truth source.

### 2. Load project context

Read `.workflow-skills/context.json` if present. If missing, run `workflow-teach` first to capture project context.

### 3. Gather webhook-specific context

Ask the user:

- What external system sends the webhook (Stripe, GitHub, etc.)?
- Can the sender deliver duplicate events?
- What side effects must be idempotent under replay?
- What compensation is needed if a downstream step fails after earlier steps succeed?

### 4. Route through the skill loop

This scenario automatically routes through the full workflow skill loop:

1. **workflow-teach** — Capture idempotency requirements, external systems, and compensation rules into `.workflow-skills/context.json`.
2. **workflow-design** — Emit a `WorkflowBlueprint` to `.workflow-skills/blueprints/webhook-ingress.json` that includes:
   - `createWebhook` for external ingress registration
   - `resumeWebhook` with `hook.token` for event delivery
   - Idempotency keys on every side-effecting step
   - `compensationPlan` for partial failure rollback
   - `operatorSignals` for ingress tracking
3. **workflow-stress** — Pressure-test the blueprint for duplicate delivery safety, idempotency coverage, and compensation completeness.
4. **workflow-verify** — Generate test matrices exercising `waitForHook`, `resumeWebhook`, `new Request()`, and `JSON.stringify()` patterns.

### 5. Emit or patch the blueprint

Write the `WorkflowBlueprint` to `.workflow-skills/blueprints/webhook-ingress.json`.

## Sample Prompts

- `/workflow-webhook ingest Stripe checkout completion safely`
- `/workflow-webhook handle GitHub push events with deduplication`
- `/workflow-webhook process payment provider callbacks`
