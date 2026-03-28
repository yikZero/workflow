---
name: workflow-audit
description: Audit an existing durable workflow or proposed workflow design for determinism, step boundaries, hooks/webhooks, retries, compensation, observability, and integration tests. Generates a scored report with P0-P3 severity ratings and a machine-readable summary. Use when the user says "audit workflow", "review workflow", "check workflow", "workflow-audit", "why is this workflow flaky", or "is this workflow safe to retry".
user-invocable: true
argument-hint: "[workflow file, flow name, route, or short description]"
metadata:
  author: Vercel Inc.
  version: '0.1'
---

# workflow-audit

Use this skill when the user wants to inspect an existing workflow implementation or a proposed workflow design without generating new code.

## Inputs

Always read these before producing output:

1. **`skills/workflow/SKILL.md`** — the authoritative API truth source
2. **`.workflow.md`** — project-specific workflow context, if present
3. Relevant implementation files — workflow files, API routes, hooks/webhook handlers, and integration tests

If `.workflow.md` does not exist, continue with a code-only audit and explicitly call out any context-dependent uncertainty. Do not block on missing context.

## Audit Process

### 1. Identify the audit target

If the user names a workflow, route, or file, audit that specific target.
If the user does not name a target, inspect the most relevant workflow files mentioned in the current task or the most recently changed workflow files in the repo.

### 2. Gather evidence

Inspect:

- `workflows/` or `src/workflows/`
- route files that call `start()`, `resumeHook()`, or `resumeWebhook()`
- tests importing `@workflow/vitest`, `workflow/api`, or workflow files
- `.workflow.md` for business invariants, failure expectations, timeout rules, and observability requirements

Do not rewrite code in this skill. Audit only.

### 3. Score the workflow across 12 checks

Score each check from **0-4**:

- **0** — broken / dangerous
- **1** — major risk
- **2** — partial / inconsistent
- **3** — solid with minor gaps
- **4** — correct and production-ready

Run these exact checks:

1. **Determinism boundary**
2. **Step granularity**
3. **Pass-by-value / serialization**
4. **Hook token strategy**
5. **Webhook response mode**
6. **`start()` placement**
7. **Stream I/O placement**
8. **Idempotency keys**
9. **Retry semantics**
10. **Rollback / compensation**
11. **Observability streams**
12. **Integration test coverage**

### 4. Tag every issue with P0-P3 severity

- **P0 Blocking** — can corrupt business invariants, duplicate side effects, hang indefinitely, or make the workflow unrecoverable
- **P1 Major** — likely to fail in production or break replay/resume under common conditions
- **P2 Minor** — correctness is mostly intact, but gaps remain
- **P3 Polish** — cleanup, clarity, maintainability, or developer-experience issue

### 5. Recommend the next skill intentionally

Choose the single best next skill based on the dominant failure mode:

- `workflow-teach` — missing repo-level context, business rules, or failure expectations
- `workflow-build` — major redesign or rewrite needed
- `workflow-idempotency` — duplicate side effects or replay safety are the main risk
- `workflow-timeout` — hooks, sleeps, wake-up behavior, or expiry rules are weak
- `workflow-webhook` — ingress, deduplication, or webhook response handling is weak
- `workflow-saga` — compensation or rollback logic is weak
- `workflow-observe` — logs, streams, or terminal signals are weak
- `workflow-approval` — approval/escalation logic is weak
- `workflow` — code is mostly sound and the user only needs API guidance

## Output Format

When you finish, output these exact sections:

## Audit Scorecard

Provide a table with one row per check:

| Check | Score | Key finding |
|-------|-------|-------------|
| Determinism boundary | 0-4 | ... |
| Step granularity | 0-4 | ... |
| Pass-by-value / serialization | 0-4 | ... |
| Hook token strategy | 0-4 | ... |
| Webhook response mode | 0-4 | ... |
| `start()` placement | 0-4 | ... |
| Stream I/O placement | 0-4 | ... |
| Idempotency keys | 0-4 | ... |
| Retry semantics | 0-4 | ... |
| Rollback / compensation | 0-4 | ... |
| Observability streams | 0-4 | ... |
| Integration test coverage | 0-4 | ... |

Then provide **Total: <score>/48** and a one-line rating:

- 42-48: Excellent
- 34-41: Good
- 24-33: Risky
- 12-23: Fragile
- 0-11: Critical

## Executive Summary

Summarize the workflow's overall health, the 2-4 most important risks, and the single best next skill.

## Detailed Findings by Severity

For each issue, use this exact shape:

- **[P?] Issue name**
  - **Location:** file, function, or flow segment
  - **Why it matters:** concrete replay/resume or business-risk explanation
  - **Recommendation:** concrete fix
  - **Suggested skill:** one of the workflow skills above

## Systemic Risks

Call out recurring patterns that appear in more than one place, such as missing idempotency namespaces, direct stream I/O in workflow context, or weak timeout coverage.

## Positive Findings

Note what is already correct and should not be regressed.

## Audit Summary

Immediately after the narrative sections, emit a single line of valid JSON with these exact fields:

```
{"event":"workflow_audit_complete","target":"<target>","score":<n>,"maxScore":48,"p0":<n>,"p1":<n>,"p2":<n>,"p3":<n>,"contractVersion":"1"}
```

## Hard Rules

Flag any violation of these as at least **P1**, and mark it **P0** if it can duplicate side effects, deadlock a workflow, or make replay invalid:

1. A `"use workflow"` function must not perform side effects or direct stream I/O.
2. All external I/O must live in `"use step"` functions.
3. `createWebhook()` must not use custom tokens.
4. `start()` inside a workflow must be wrapped in a `"use step"` function.
5. Side-effecting steps must have stable idempotency keys.
6. Compensation must exist for irreversible partial success.
7. Timeout paths are domain outcomes, not accidental hangs.
8. Integration tests must cover each suspension type that the workflow uses.

## Sample Usage

**Input:** `/workflow-audit purchase-approval`

**Expected behavior:** audits the workflow implementation and tests, reports issues like missing `waitForSleep` coverage or non-deterministic approval tokens, recommends the next workflow skill, and emits the `workflow_audit_complete` JSON summary.

Sample prompt:

```
/workflow-audit approval-expiry-escalation
```

Expected machine-readable line:

```json
{"event":"workflow_audit_complete","target":"approval-expiry-escalation","score":34,"maxScore":48,"p0":0,"p1":2,"p2":4,"p3":1,"contractVersion":"1"}
```
