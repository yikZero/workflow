---
name: workflow-observe
description: Design observable workflows with operator-visible progress, stream namespaces, and terminal signals. Triggers on "observability workflow", "workflow-observe", "operator streams", or "workflow progress streaming".
metadata:
  author: Vercel Inc.
  version: '0.1'
user-invocable: true
argument-hint: "[flow or domain]"
---

# workflow-observe

Design operator-visible progress, stream namespaces, and terminal signals.

## Scenario Goal

Operator-visible progress, stream namespaces, and terminal signals.

## Required Patterns

This scenario exercises: stream, hook, sleep.

## Steps

### 1. Read the workflow skill

Read `skills/workflow/SKILL.md` to load the current API truth source.

### 2. Load project context

Read `.workflow-skills/context.json` if present. If missing, run `workflow-teach` first to capture project context.

### 3. Gather observability-specific context

Ask the user:

- What progress milestones should operators see in real time?
- What stream namespaces are needed (e.g., `progress`, `audit`, `errors`)?
- What terminal signals mark workflow completion or failure?
- How should `operatorSignals` map to monitoring dashboards?

### 4. Route through the skill loop

This scenario automatically routes through the full workflow skill loop:

1. **workflow-teach** — Capture observability requirements, business invariants, and stream namespace needs into `.workflow-skills/context.json`.
2. **workflow-design** — Emit a `WorkflowBlueprint` to `.workflow-skills/blueprints/operator-observability-streams.json` that includes:
   - `getWritable` for streaming progress to operators
   - Stream `namespace` entries for structured output channels
   - `operatorSignals` covering every significant state transition
   - `hook` suspensions for operator-initiated actions
   - `sleep` suspensions for periodic progress updates
3. **workflow-stress** — Pressure-test the blueprint for stream/log assertion coverage, ensuring `getWritable()` placement is correct and all `operatorSignals` are exercised.
4. **workflow-verify** — Generate test matrices with stream assertions, operator signal verification, and namespace coverage checks.

### 5. Emit or patch the blueprint

Write the `WorkflowBlueprint` to `.workflow-skills/blueprints/operator-observability-streams.json`.

## Sample Prompts

- `/workflow-observe stream operator progress and final status`
- `/workflow-observe add real-time progress tracking to order processing`
- `/workflow-observe instrument approval flow with operator dashboards`
