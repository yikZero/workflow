---
name: workflow-teach
description: One-time setup that captures project context for workflow building. Use when the user wants to teach the assistant how workflows should be designed for this project. Triggers on "teach workflow", "set up workflow context", "configure workflow skills", or "workflow-teach".
metadata:
  author: Vercel Inc.
  version: '0.6'
---

# workflow-teach

Use this skill when the user wants to teach the assistant how workflows should be designed for this project.

## Skill Loop Position

**Stage 1 of 2** in the workflow skill loop: **teach** → build

| Stage | Skill | Purpose |
|-------|-------|---------|
| **1** | **workflow-teach** (you are here) | Capture project context into `.workflow.md` |
| 2 | workflow-build | Build workflow code guided by context |

**Next:** Run `workflow-build` after this skill completes.

## Steps

Always do these steps:

### 1. Read the workflow skill

Read `skills/workflow/SKILL.md` to load the current API truth source. Do not fork or duplicate its guidance — reference it as the authoritative source for all workflow API behavior.

### 2. Inspect the repo for workflow surfaces

Search the repository for:

- `workflows/` or `src/workflows/` directories
- API routes (e.g. `app/api/`, `pages/api/`, route handlers)
- Queue consumers or background job processors
- Webhook handlers
- Existing `"use workflow"` and `"use step"` directives
- Test files related to workflows (e.g. files importing `@workflow/vitest`, `workflow/api`)
- Configuration files (`next.config.*`, `workflow.config.*`, `package.json` workflow dependencies)

### 3. Conduct the workflow context interview

After completing the repo scan, ask the user targeted follow-up questions to fill gaps in the context that the codebase alone cannot reveal. Only ask questions whose answers are not already inferable from the repo scan — do not re-ask facts you have already discovered.

Cover these exact buckets, skipping any that are already resolved from the repo:

1. **Workflow starter/emitter** — "What starts this workflow, and who or what emits that event?"
2. **Repeat-safe side effects** — "Which side effects must be safe to repeat (idempotent)?"
3. **Permanent vs retryable failures** — "What counts as a permanent failure vs. a retryable failure?"
4. **Approval actors** — "Does any step require human approval, and who is allowed to approve?"
5. **Timeout/expiry rules** — "What timeout or expiry rules exist?"
6. **Compensation requirements** — "If a side effect succeeds and a later step fails, what compensation is required?"
7. **Operator observability needs** — "What must operators be able to observe in logs/streams?"

Ask only the unresolved questions in a single batch. Wait for the user's answers before proceeding to step 4.

### 4. Create or update `.workflow.md`

Create or update `.workflow.md` in the project root with the following sections. Write in plain English — this file is for humans and agents to read, not a machine schema.

```markdown
# .workflow.md

## Project Context

Project name, what it does, why it needs durable workflows, and paths to any
existing workflow files or tests found in the repo.

## Business Rules

Rules that must never be violated. Include idempotency requirements here —
which side effects must be safe to repeat and how.

Examples: "An order must not be charged twice", "Refund cannot exceed original
amount", "Payment charge uses idempotency key from order ID".

## External Systems

Third-party services and infrastructure the workflows interact with. Note
which are idempotent, which have compensation APIs, and which are rate-limited.

Also list trigger surfaces: API routes, webhooks, queue messages, cron jobs,
or UI actions that start workflows.

## Failure Expectations

What counts as a permanent failure vs. a retryable failure in this project.
Include approval rules (who approves, what happens on timeout), timeout and
expiry policies, and compensation rules (what to undo when a later step fails).

## Observability Needs

What operators need to see in logs or streams. What the UI needs streamed
for real-time progress.

## Approved Patterns

Anti-patterns that are relevant to this project's workflow surfaces. These
serve as awareness for anyone building workflows in this codebase.

## Open Questions

Unresolved questions that could not be answered from the repo scan or the
interview. These will be surfaced again by workflow-build.
```

Populate sections from both the repo scan (step 2) and the interview answers (step 3). For any question the user could not answer, add it to **Open Questions** so `workflow-build` can surface it again.

### 5. Evaluate anti-patterns

Include the following anti-patterns in the **Approved Patterns** section when they are relevant to the project's workflow surfaces:

- **Node.js APIs in `"use workflow"`** — Workflow functions run in a sandboxed VM without full Node.js access. Any use of `fs`, `path`, `crypto`, `Buffer`, `process`, or other Node.js built-ins must live in a `"use step"` function.
- **Side effects split across too many tiny steps** — Each step is persisted and replayed. Over-granular step boundaries add latency, increase event log size, and make debugging harder. Group related I/O into a single step unless you need independent retry or suspension between them.
- **Direct stream I/O in workflow context** — `getWritable()` may be called in either `"use workflow"` or `"use step"` functions to obtain a stream reference, but direct stream I/O (`getWriter()`, `write()`, `close()`, or reading from a stream) must happen inside `"use step"` functions. The workflow orchestrator cannot hold open stream I/O across replay boundaries.
- **`createWebhook()` with a custom token** — `createWebhook()` does not accept custom tokens. Only `createHook()` supports deterministic token strategies. Using a custom token with `createWebhook()` will fail silently or produce unexpected behavior.
- **`start()` called directly from workflow code** — Starting a child workflow from inside a workflow function must be wrapped in a `"use step"` function. Direct `start()` calls in workflow context will fail because `start()` is a side effect that requires full Node.js access.
- **Mutating step inputs without returning the updated value** — Step functions use pass-by-value semantics. If you modify data inside a step, you must `return` the new value and reassign it in the calling workflow. Mutations to the input object are lost after replay.

### 6. Output results

When you finish, output these exact sections:

## Captured Context

Summarize what was discovered: project name, goal, trigger surfaces found, external systems identified, relevant anti-patterns, and any canonical examples located in the repo. Also summarize the business rules, failure expectations, and observability needs gathered from the interview.

## Open Questions

List anything that could not be determined from the repo scan or the interview and needs further investigation. These should match the **Open Questions** section in `.workflow.md`.

## Next Recommended Skill

Recommend `workflow-build` to start building workflows using the captured context. For simple workflows with no suspensions, the user can also use `workflow` directly.

---

## Sample Usage

**Input:** `Teach workflow skills about our refund approval system.`

**Expected output:** A `.workflow.md` file capturing the refund approval domain — including business rules like "refund cannot exceed original charge" and "payment charge uses idempotency key from order ID", failure expectations covering approval timeout behavior and compensation rules, observability needs for audit logging — plus the three output headings above with specific findings, open questions, and a recommendation to run `workflow-build` next.
