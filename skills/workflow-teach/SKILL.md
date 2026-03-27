---
name: workflow-teach
description: One-time setup that captures project context for workflow design skills. Use when the user wants to teach the assistant how workflows should be designed for this project. Triggers on "teach workflow", "set up workflow context", "configure workflow skills", or "workflow-teach".
metadata:
  author: Vercel Inc.
  version: '0.1'
---

# workflow-teach

Use this skill when the user wants to teach the assistant how workflows should be designed for this project.

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

### 3. Create or update context file

Create or update `.workflow-skills/context.json` with this exact shape:

```json
{
  "projectName": "",
  "productGoal": "",
  "triggerSurfaces": [],
  "externalSystems": [],
  "antiPatterns": [],
  "canonicalExamples": []
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

### 4. Evaluate anti-patterns

Include the following anti-patterns in `antiPatterns` when they are relevant to the project's workflow surfaces:

- **Node.js APIs in `"use workflow"`** — Workflow functions run in a sandboxed VM without full Node.js access. Any use of `fs`, `path`, `crypto`, `Buffer`, `process`, or other Node.js built-ins must live in a `"use step"` function.
- **Side effects split across too many tiny steps** — Each step is persisted and replayed. Over-granular step boundaries add latency, increase event log size, and make debugging harder. Group related I/O into a single step unless you need independent retry or suspension between them.
- **Stream reads or writes in workflow context** — `getWritable()` and stream consumption must happen inside `"use step"` functions. The workflow orchestrator cannot hold open streams across replay boundaries.
- **`createWebhook()` with a custom token** — `createWebhook()` does not accept custom tokens. Only `createHook()` supports deterministic token strategies. Using a custom token with `createWebhook()` will fail silently or produce unexpected behavior.
- **`start()` called directly from workflow code** — Starting a child workflow from inside a workflow function must be wrapped in a `"use step"` function. Direct `start()` calls in workflow context will fail because `start()` is a side effect that requires full Node.js access.
- **Mutating step inputs without returning the updated value** — Step functions use pass-by-value semantics. If you modify data inside a step, you must `return` the new value and reassign it in the calling workflow. Mutations to the input object are lost after replay.

### 5. Output results

When you finish, output these exact sections:

## Captured Context

Summarize what was discovered: project name, goal, trigger surfaces found, external systems identified, relevant anti-patterns, and any canonical examples located in the repo.

## Open Assumptions

List anything that could not be determined from the repo alone and needs user confirmation. Examples: unclear external service dependencies, ambiguous workflow triggers, missing test coverage, uncertain retry requirements.

## Next Recommended Skill

Recommend the next skill to use based on what was captured. Typically this is `workflow-design` to create a workflow blueprint, or `workflow` if the user is ready to implement directly.

---

## Sample Usage

**Input:** `Teach workflow skills about our refund approval system.`

**Expected output:** A filled `.workflow-skills/context.json` capturing the refund approval domain, plus the three headings above with specific findings about the project's workflow surfaces, assumptions that need confirmation, and which skill to use next.
