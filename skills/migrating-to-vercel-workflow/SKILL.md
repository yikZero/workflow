---
name: migrating-to-vercel-workflow
description: Migrates Temporal, Inngest, and AWS Step Functions workflows to Vercel Workflow. Use when porting Activities, Workers, Signals, step.run(), step.waitForEvent(), ASL JSON state machines, Task/Choice/Wait/Parallel states, task tokens, or child workflows.
metadata:
  author: Vercel Inc.
  version: '0.1.3'
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
- For Signals, `step.waitForEvent()`, and `.waitForTaskToken`, choose exactly one resume surface:
  - Use `createHook()` + `resumeHook()` when the app resumes the workflow from server-side code with a deterministic business token.
  - Use `createWebhook()` when the external system needs a generated callback URL or the migrated flow should receive a raw `Request`.
- Never pair `createWebhook()` with `resumeHook()`, and never pass `token:` to `createWebhook()`.
- Wrap `start()` and `getRun()` inside `"use step"` functions for child runs.
- Use `getStepMetadata().stepId` as the idempotency key for external writes.
- Use `getWritable()` in workflow context to obtain the stream, but interact with it (write, close) only inside `"use step"` functions.
- Prefer rollback stacks for multi-step compensation.
- Choose app-boundary syntax in this order:
  1. If the prompt explicitly asks for framework-agnostic app-boundary code, use plain `Request` / `Response` even when a framework like Hono is named.
  2. Otherwise, if the target framework is named, shape app-boundary examples to that framework.
  3. Otherwise, keep examples framework-agnostic with `Request` / `Response`. Do not default to Next.js-only route signatures unless Next.js is explicitly named.

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

## Fast-path router

Choose the first matching route before writing any code.

| Route key | Trigger phrases in the prompt | Must emit | Must not emit |
| --- | --- | --- | --- |
| `resume/internal` | signal, approval API, deterministic token, server-side resume | `createHook()`, deterministic `token`, `resumeHook()` | `createWebhook()`, callback URL |
| `resume/url` | callback URL, vendor webhook, raw `Request`, external POST back, `.waitForTaskToken` with an external caller | `createWebhook()`, `webhook.url`, `RequestWithResponse` when manual response is needed | `resumeHook()`, `token:` on `createWebhook()` |
| `runtime/self-hosted` | self-hosted, non-Vercel, custom infra, Hono + Postgres, Express + Redis | `World extends Storage, Queue, Streamer`, `await getWorld().start?.()`, explicit note that workflow/step code can stay the same | claims of Vercel-managed execution |
| `boundary/framework-agnostic` | "framework-agnostic" explicitly requested | plain `Request` / `Response` handlers | framework-specific route syntax |
| `boundary/named-framework` | Next.js, Hono, Express, Fastify, NestJS explicitly named without a framework-agnostic override | app-boundary code in that framework's syntax | unrelated framework syntax or defaulting to Next.js |

Before drafting `## Migrated Code`, write the chosen route keys in `## Migration Plan`.

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
- [ ] A self-hosted or non-Vercel target omits the `World` requirement or startup bootstrap
- [ ] App-boundary examples ignore an explicitly requested framework-agnostic requirement or a named target framework
- [ ] The migration claims Vercel-managed execution for a self-hosted or non-Vercel target

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

### Additional sample prompt

```md
Migrate this AWS Step Functions approval flow to Vercel Workflow for Hono on self-hosted Postgres.
The external vendor needs a callback URL.
Keep app-boundary code in Hono syntax.
```

Expected passing excerpt:

```ts
interface World extends Storage, Queue, Streamer {
  start?(): Promise<void>;
}
```

```ts
import { getWorld } from 'workflow/runtime';
export async function startWorkflowWorld(): Promise<void> {
  await getWorld().start?.();
}
```

```ts
import { Hono } from 'hono';
import { start } from 'workflow/api';
import { refundWorkflow } from '../workflows/refund';
const app = new Hono();
app.post('/api/refunds/start', async (c) => {
  const body = (await c.req.json()) as { refundId: string };
  const run = await start(refundWorkflow, [body.refundId]);
  return c.json({ runId: run.runId });
});
export default app;
```

Required explanation: The workflow and step code can stay the same. Because this target is self-hosted, the app still needs a `World` implementation for storage, queueing, and streaming, plus a startup path that calls `await getWorld().start?.()` when the selected world runs background workers.

Must also appear in the workflow code:

```ts
using approval = createWebhook({ respondWith: 'manual' });
```

Must not appear:

```ts
resumeHook(...)
```
