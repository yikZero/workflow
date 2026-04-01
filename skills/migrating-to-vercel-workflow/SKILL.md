---
name: migrating-to-vercel-workflow
description: Migrates Temporal, Inngest, and AWS Step Functions workflows to Vercel Workflow. Use when porting Activities, Workers, Signals, step.run(), step.waitForEvent(), ASL JSON state machines, Task/Choice/Wait/Parallel states, task tokens, or child workflows.
metadata:
  author: Vercel Inc.
  version: '0.1.2'
---

# Migrating to Vercel Workflow

Use this skill when converting an existing orchestration system to Vercel Workflow.

## Intake

1. Identify the source system:
   - Temporal
   - Inngest
   - AWS Step Functions
2. Identify the target runtime:
   - Deploying on Vercel -> keep examples focused on `start()`, `getRun()`, hooks/webhooks, and route handlers.
   - Non-Vercel or self-hosted -> also read `references/runtime-targets.md` and explicitly say the workflow/step code can stay the same, but deployment still needs a `World` implementation and startup bootstrap.
3. Extract the source constructs:
   - entrypoint
   - waits / timers
   - external callbacks / approvals
   - retries / failure handling
   - child workflows / fan-out
   - progress streaming
   - external side effects

## Default migration rules

- Put orchestration in `"use workflow"` functions.
- Put side effects, SDK calls, DB calls, HTTP calls, and stream I/O in `"use step"` functions.
- Use `sleep()` only in workflow context.
- Prefer `createHook()` + `resumeHook()` for Signals, `step.waitForEvent()`, and `.waitForTaskToken` migrations.
- Use `createWebhook()` only when the migrated system should expose a generated callback URL and work with raw `Request` / `Response` objects.
- Wrap `start()` and `getRun()` inside `"use step"` functions for child runs.
- Use `getStepMetadata().stepId` as the idempotency key for external writes.
- Use `getWritable()` in workflow context to obtain the stream, but interact with it (write, close) only inside `"use step"` functions.
- Prefer rollback stacks for multi-step compensation.
- If the prompt explicitly asks for framework-agnostic app-boundary code, keep route examples on plain `Request` / `Response` even when a framework like Hono is named. Otherwise, if the target framework is unspecified, keep examples framework-agnostic. Do not default to Next.js-only route signatures unless Next.js is explicitly named.

## Resume surface selection

Choose one resume surface and explain the choice inside `## App Boundary / Resume Endpoints`.

- `createHook()` + `resumeHook()`
  - Use for Signals, `step.waitForEvent()`, or `.waitForTaskToken`.
  - Use when the app resumes the workflow from server-side code with a deterministic business token.
- `createWebhook()`
  - Use when the external system needs a callback URL.
  - Use when the migrated flow should receive a raw `Request`.
  - With `respondWith: 'manual'`, call `request.respondWith()` inside a `"use step"` function.
  - Never pass `token:` to `createWebhook()`.

Canonical examples live in:

- `references/shared-patterns.md` -> `## Deterministic server-side resume`
- `references/shared-patterns.md` -> `## Generated callback URL`

**Sample input:** `Migrate a third-party document verification callback flow to Vercel Workflow. The vendor needs a callback URL.`

**Expected output:** The migration uses `createWebhook({ respondWith: 'manual' })`, passes `webhook.url` to the vendor, handles `RequestWithResponse` in a step, and does **not** use `resumeHook()`.

## Source references

- Temporal -> `references/temporal.md`
- Inngest -> `references/inngest.md`
- AWS Step Functions -> `references/aws-step-functions.md`

## Shared references

- `references/shared-patterns.md` — reusable code templates for hooks, child workflows, idempotency, streaming, and rollback.
- `references/runtime-targets.md` — Vercel-managed vs custom `World` guidance.

## Required output shape

Return the migration in this structure:

```md
## Migration Plan
## Source -> Target Mapping
## Migrated Code
## App Boundary / Resume Endpoints
## Verification Checklist
## Open Questions
```

## Verification checklist

Fail the draft if any of these are true:

- [ ] Source-framework primitives remain in the migrated code
- [ ] Side effects remain in workflow context
- [ ] `sleep()` appears inside a step
- [ ] Stream interaction (`getWriter()`, `write()`, `close()`) appears inside a workflow function
- [ ] Child workflows call `start()` / `getRun()` directly from workflow context
- [ ] External writes omit idempotency keys
- [ ] Hooks/webhooks are missing where the source used signals, waitForEvent, or task tokens
- [ ] A callback-URL flow uses `createHook()` + `resumeHook()` instead of `createWebhook()`
- [ ] `createWebhook()` is given a custom `token` or paired with `resumeHook()`

## Sample prompt

```
Migrate this Inngest workflow to Vercel Workflow.
It uses step.waitForEvent() with a timeout and step.realtime.publish().
```

Expected response shape:

```md
## Migration Plan
## Source -> Target Mapping
## Migrated Code
## App Boundary / Resume Endpoints
## Verification Checklist
## Open Questions
```
