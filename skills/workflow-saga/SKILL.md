---
name: workflow-saga
description: Design saga workflows with multi-step side effects and explicit compensation for partial failure. Triggers on "saga workflow", "workflow-saga", "compensation workflow", or "multi-step rollback".
metadata:
  author: Vercel Inc.
  version: '0.1'
user-invocable: true
argument-hint: "[flow or domain]"
---

# workflow-saga

Design multi-step side effects with explicit compensation.

## Scenario Goal

Multi-step side effects with explicit compensation.

## Required Patterns

This scenario exercises: compensation, retry.

## Steps

### 1. Read the workflow skill

Read `skills/workflow/SKILL.md` to load the current API truth source.

### 2. Load project context

Read `.workflow-skills/context.json` if present. If missing, run `workflow-teach` first to capture project context.

### 3. Gather saga-specific context

Ask the user:

- What are the ordered side effects (e.g., reserve inventory, charge payment, ship)?
- For each step, what is the compensation action if a later step fails?
- Which steps are idempotent and which need explicit deduplication?
- What should operators observe during partial-success scenarios?

### 4. Route through the skill loop

This scenario automatically routes through the full workflow skill loop:

1. **workflow-teach** — Capture compensation rules, business invariants, and idempotency requirements into `.workflow-skills/context.json`.
2. **workflow-design** — Emit a `WorkflowBlueprint` to `.workflow-skills/blueprints/compensation-saga.json` that includes:
   - Ordered steps with explicit `compensationPlan` entries
   - Retry semantics with `RetryableError` and `FatalError` classification
   - Idempotency keys on all irreversible side effects
   - `invariants` for saga consistency guarantees
   - `operatorSignals` for compensation tracking
3. **workflow-stress** — Pressure-test the blueprint for compensation completeness, partial-success scenarios, and rollback ordering.
4. **workflow-verify** — Generate test matrices covering happy path, partial failure with compensation, and full rollback scenarios.

### 5. Emit or patch the blueprint

Write the `WorkflowBlueprint` to `.workflow-skills/blueprints/compensation-saga.json`.

## Sample Prompts

- `/workflow-saga reserve inventory, charge payment, compensate on shipping failure`
- `/workflow-saga multi-step order fulfillment with rollback`
- `/workflow-saga booking flow with partial cancellation`
