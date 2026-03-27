---
name: workflow-teach
description: One-time setup that captures project context for workflow design skills. Use when the user wants to teach the assistant how workflows should be designed for this project. Triggers on "teach workflow", "set up workflow context", "configure workflow skills", or "workflow-teach".
metadata:
  author: Vercel Inc.
  version: '0.5'
---

# workflow-teach

Use this skill when the user wants to teach the assistant how workflows should be designed for this project.

## Skill Loop Position

**Stage 1 of 4** in the workflow skill loop: **teach** → design → stress → verify

| Stage | Skill | Purpose |
|-------|-------|---------|
| **1** | **workflow-teach** (you are here) | Capture project context |
| 2 | workflow-design | Emit a WorkflowBlueprint |
| 3 | workflow-stress | Pressure-test the blueprint |
| 4 | workflow-verify | Generate test matrices and verification artifacts |

**Prerequisite:** `workflow-init` (Workflow DevKit must be installed).
**Next:** Run `workflow-design` after this skill completes.

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

### 4. Create or update context file

Create or update `.workflow-skills/context.json` with this exact shape:

```json
{
  "contractVersion": "1",
  "projectName": "",
  "productGoal": "",
  "triggerSurfaces": [],
  "externalSystems": [],
  "antiPatterns": [],
  "canonicalExamples": [],
  "businessInvariants": [],
  "idempotencyRequirements": [],
  "approvalRules": [],
  "timeoutRules": [],
  "compensationRules": [],
  "observabilityRequirements": [],
  "openQuestions": []
}
```

Field guidance:

| Field | What to capture |
|-------|----------------|
| `projectName` | The name of the project from `package.json` or repo root |
| `productGoal` | A one-sentence summary of what the project does and why workflows are needed |
| `triggerSurfaces` | How workflows get started: API routes, webhooks, queue messages, cron jobs, UI actions |
| `externalSystems` | Third-party services the workflows interact with: databases, payment providers, email services, storage, etc. |
| `antiPatterns` | Which anti-patterns from the list below are relevant to this project |
| `canonicalExamples` | Paths to existing workflow files or tests that demonstrate the project's patterns |
| `businessInvariants` | Rules that must never be violated (e.g. "an order must not be charged twice", "refund cannot exceed original amount") |
| `idempotencyRequirements` | Side effects that must be safe to repeat and the strategy for each (e.g. "payment charge uses idempotency key from order ID") |
| `approvalRules` | Steps requiring human approval: who approves, token strategy, and what happens on timeout |
| `timeoutRules` | Expiry and timeout policies (e.g. "approval expires after 72 hours", "webhook must respond within 30 seconds") |
| `compensationRules` | What to undo when a later step fails (e.g. "refund payment if shipping fails", "revoke access if onboarding incomplete") |
| `observabilityRequirements` | What operators need to see in logs or streams (e.g. "stream step progress to UI", "log payment confirmation with transaction ID") |
| `openQuestions` | Unresolved questions that could not be answered from the repo or the interview — carry these forward for downstream skills |

Populate fields from both the repo scan (step 2) and the interview answers (step 3). For any question the user could not answer, add it to `openQuestions` so downstream skills can surface it again.

### 5. Evaluate anti-patterns

Include the following anti-patterns in `antiPatterns` when they are relevant to the project's workflow surfaces:

- **Node.js APIs in `"use workflow"`** — Workflow functions run in a sandboxed VM without full Node.js access. Any use of `fs`, `path`, `crypto`, `Buffer`, `process`, or other Node.js built-ins must live in a `"use step"` function.
- **Side effects split across too many tiny steps** — Each step is persisted and replayed. Over-granular step boundaries add latency, increase event log size, and make debugging harder. Group related I/O into a single step unless you need independent retry or suspension between them.
- **Direct stream I/O in workflow context** — `getWritable()` may be called in either `"use workflow"` or `"use step"` functions to obtain a stream reference, but direct stream I/O (`getWriter()`, `write()`, `close()`, or reading from a stream) must happen inside `"use step"` functions. The workflow orchestrator cannot hold open stream I/O across replay boundaries.
- **`createWebhook()` with a custom token** — `createWebhook()` does not accept custom tokens. Only `createHook()` supports deterministic token strategies. Using a custom token with `createWebhook()` will fail silently or produce unexpected behavior.
- **`start()` called directly from workflow code** — Starting a child workflow from inside a workflow function must be wrapped in a `"use step"` function. Direct `start()` calls in workflow context will fail because `start()` is a side effect that requires full Node.js access.
- **Mutating step inputs without returning the updated value** — Step functions use pass-by-value semantics. If you modify data inside a step, you must `return` the new value and reassign it in the calling workflow. Mutations to the input object are lost after replay.

### 6. Output results

When you finish, output these exact sections:

## Captured Context

Summarize what was discovered: project name, goal, trigger surfaces found, external systems identified, relevant anti-patterns, and any canonical examples located in the repo. Also summarize the business invariants, idempotency requirements, approval rules, timeout rules, compensation rules, and observability requirements gathered from the interview.

## Open Questions

List anything that could not be determined from the repo scan or the interview and needs further investigation. These should match the `openQuestions` field in `context.json`.

## Next Recommended Skill

Recommend the next skill to use based on what was captured. Typically this is `workflow-design` to create a workflow blueprint, or `workflow` if the user is ready to implement directly. For externally-driven workflows (webhooks, hooks, sleep, child workflows), recommend `workflow-design` followed immediately by `workflow-stress` to pressure-test the blueprint before implementation.

---

## Sample Usage

**Input:** `Teach workflow skills about our refund approval system.`

**Expected output:** A filled `.workflow-skills/context.json` capturing the refund approval domain — including business invariants like "refund cannot exceed original charge", idempotency requirements for the payment refund call, approval rules for who can authorize refunds, timeout rules for approval expiry, compensation rules for partial refund failures, and observability requirements for audit logging — plus the three headings above with specific findings about the project's workflow surfaces, open questions that need follow-up, and which skill to use next.
