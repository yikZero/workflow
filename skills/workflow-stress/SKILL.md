---
name: workflow-stress
description: Pressure-test an existing workflow blueprint for edge cases, determinism violations, and missing coverage. Produces severity-ranked fixes and a patched blueprint. Use after workflow-design. Triggers on "stress test workflow", "pressure test blueprint", "workflow edge cases", or "workflow-stress".
metadata:
  author: Vercel Inc.
  version: '0.4'
---

# workflow-stress

Use this skill after a workflow blueprint exists. It pressure-tests the blueprint against the full checklist of workflow edge cases and produces a patched version.

## Inputs

Always read these before producing output:

1. **`skills/workflow/SKILL.md`** — the authoritative API truth source.
2. **`.workflow-skills/context.json`** — if it exists, use project context to evaluate domain-specific risks.
3. **The current workflow blueprint** — either from the conversation or from `.workflow-skills/blueprints/*.json`.

## Checklist

Run every item in this checklist against the blueprint. Each item that reveals an issue must appear in the output with its severity:

### 1. Determinism boundary
- Does any `"use workflow"` function perform I/O, direct stream I/O, or use Node.js-only APIs?
- If the workflow uses time or randomness, is it relying only on the Workflow DevKit's seeded workflow-context APIs rather than external nondeterministic sources?

### 2. step granularity
- Are steps too granular (splitting a single logical operation into many tiny steps)?
- Are steps too coarse (grouping unrelated side effects that need independent retry)?
- Does each step represent a meaningful unit of work with clear retry semantics?

### 3. Pass-by-value / serialization issues
- Does any step mutate its input without returning the updated value?
- Are all step inputs and outputs JSON-serializable?
- Are there closures, class instances, or functions passed between workflow and step contexts?

### 4. Hook token strategy
- Does `createHook()` use deterministic tokens where appropriate (e.g. `approval:${entityId}`)?
- Is `createWebhook()` incorrectly using custom tokens? (It must not.)
- Are hook tokens unique enough to avoid collisions across concurrent runs?

### 5. Webhook response mode
- Is the webhook response mode (`static` or `manual`) appropriate for the use case?
- Does a `static` webhook correctly return a fixed response without blocking?

### 6. `start()` placement
- Is `start()` (child workflow invocation) called directly from workflow context? (It must be wrapped in a step.)

### 7. Stream I/O placement
- Does any workflow directly call `getWriter()`, `write()`, `close()`, or read from a stream?
- If `getWritable()` is called in workflow context, is the stream only being obtained and then passed into a step for actual I/O?

### 8. Idempotency keys
- Does every step with external side effects have an idempotency strategy?
- Are idempotency keys derived from stable, unique identifiers (not timestamps or random values)?

### 9. Retry semantics
- Is `FatalError` used for genuinely permanent failures (invalid input, already-processed, auth denied)?
- Is `RetryableError` used for genuinely transient failures (network timeout, rate limit, temporary unavailability)?
- Are `maxRetries` values reasonable for each step's failure mode?

### 10. Rollback / compensation strategy
- If a step fails after prior steps have committed side effects, is there a compensation step?
- Are partial-success scenarios handled (e.g. payment charged but email failed)?

### 11. Observability streams
- Does the workflow emit enough progress information for monitoring?
- Are stream namespaces used to separate different types of progress data?

### 12. Integration test coverage
- Does the test plan cover the happy path?
- Does the test plan cover each suspension point (hook, webhook, sleep)?
- Does the test plan verify failure paths (`FatalError`, `RetryableError`, timeout)?
- Are the correct test helpers used (`waitForHook`, `resumeHook`, `waitForSleep`, `wakeUp`, etc.)?

## Output Sections

Output exactly these sections in order:

### `## Critical Fixes`

Issues that will cause runtime failures, data loss, or incorrect behavior. Each entry must include:
- **Checklist item** that caught it
- **What's wrong** — specific description of the violation
- **Fix** — concrete change to make in the blueprint

### `## Should Fix`

Issues that won't cause immediate failures but represent poor practice, missing coverage, or fragility. Same format as Critical Fixes.

### `## Blueprint Patch`

A fenced `json` block containing a **full replacement** JSON blueprint (not a diff) that incorporates all fixes from both sections above. This must be valid, parseable JSON matching the `WorkflowBlueprint` type.

Write the patched blueprint to `.workflow-skills/blueprints/<workflow-name>.json`, overwriting the previous version.

## Hard Rules

These constraints from `skills/workflow/SKILL.md` must be enforced during every stress test:

- Workflow functions orchestrate only — no side effects.
- All I/O lives in `"use step"`.
- `createHook()` supports deterministic tokens; `createWebhook()` does not.
- `getWritable()` may be called in workflow or step context; direct stream I/O happens in steps only.
- `start()` in workflow context must be wrapped in a step.
- `FatalError` and `RetryableError` recommendations must be intentional with clear rationale.

## Sample Usage

**Input:** `Stress-test this workflow blueprint for a human-in-the-loop onboarding flow.`

**Expected output:** Severity-ranked issues covering determinism boundary violations, missing idempotency, incorrect hook token strategy, insufficient test coverage, and a full patched blueprint that closes all gaps.
