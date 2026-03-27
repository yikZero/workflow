---
name: workflow-timeout
description: Design timeout workflows whose correctness depends on expiry and wake-up behavior. Triggers on "timeout workflow", "workflow-timeout", "expiry workflow", or "sleep wake-up workflow".
metadata:
  author: Vercel Inc.
  version: '0.1'
user-invocable: true
argument-hint: "[flow or domain]"
---

# workflow-timeout

Design flows whose correctness depends on expiry and wake-up behavior.

## Scenario Goal

Flows whose correctness depends on expiry and wake-up behavior.

## Required Patterns

This scenario exercises: sleep, hook, retry.

## Steps

### 1. Read the workflow skill

Read `skills/workflow/SKILL.md` to load the current API truth source.

### 2. Load project context

Read `.workflow-skills/context.json` if present. If missing, run `workflow-teach` first to capture project context.

### 3. Gather timeout-specific context

Ask the user:

- What operations have deadlines or expiry windows?
- What should happen when a timeout fires (reject, escalate, retry)?
- Are there multiple timeout tiers (e.g., 48h then 24h)?
- How should operators observe timeout and wake-up events?

### 4. Route through the skill loop

This scenario automatically routes through the full workflow skill loop:

1. **workflow-teach** — Capture timeout rules, approval rules, and observability requirements into `.workflow-skills/context.json`.
2. **workflow-design** — Emit a `WorkflowBlueprint` to `.workflow-skills/blueprints/approval-timeout-streaming.json` that includes:
   - `sleep` suspensions with explicit durations
   - `hook` suspensions paired with sleeps via `Promise.race`
   - `getWritable` for streaming progress to operators
   - Test plans using `waitForSleep` and `wakeUp` helpers
3. **workflow-stress** — Pressure-test the blueprint for timeout correctness, ensuring every sleep has a corresponding wake-up path and that `getWritable()` is called in workflow context using seeded workflow-context APIs.
4. **workflow-verify** — Generate test matrices exercising `waitForSleep`, `wakeUp`, `waitForHook`, `resumeHook`, and streaming assertions.

### 5. Emit or patch the blueprint

Write the `WorkflowBlueprint` to `.workflow-skills/blueprints/approval-timeout-streaming.json`.

## Sample Prompts

- `/workflow-timeout wait 24h for approval, then expire`
- `/workflow-timeout multi-tier escalation with 48h and 24h windows`
- `/workflow-timeout payment hold expiry with auto-release`
