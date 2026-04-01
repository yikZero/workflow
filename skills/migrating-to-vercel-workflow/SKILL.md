---
name: migrating-to-vercel-workflow
description: Migrates Temporal, Inngest, and AWS Step Functions workflows to Vercel Workflow. Use when porting Activities, Workers, Signals, step.run(), step.waitForEvent(), ASL JSON state machines, Task/Choice/Wait/Parallel states, task tokens, or child workflows.
metadata:
  author: Vercel Inc.
  version: '0.1.5'
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

Route selection is compositional. A prompt can require multiple route keys.
Select up to one key from each axis below.

### Resume axis

| Route key | Trigger phrases in the prompt | Must emit | Must not emit |
| --- | --- | --- | --- |
| `resume/internal` | signal, approval API, deterministic token, server-side resume | `createHook()`, deterministic `token`, `resumeHook()` | `createWebhook()`, callback URL |
| `resume/url` | callback URL, vendor webhook, raw `Request`, external POST back, `.waitForTaskToken` with an external caller | `createWebhook()`, `webhook.url`, `RequestWithResponse` when manual response is needed | `resumeHook()`, `token:` on `createWebhook()` |

### Runtime axis

| Route key | Trigger phrases in the prompt | Must emit | Must not emit |
| --- | --- | --- | --- |
| `runtime/self-hosted` | self-hosted, non-Vercel, custom infra, Hono + Postgres, Express + Redis | `World extends Storage, Queue, Streamer`, `await getWorld().start?.()`, explicit note that workflow/step code can stay the same | claims of Vercel-managed execution |

### App-boundary axis

| Route key | Trigger phrases in the prompt | Must emit | Must not emit |
| --- | --- | --- | --- |
| `boundary/framework-agnostic` | "framework-agnostic" explicitly requested | plain `Request` / `Response` handlers | framework-specific route syntax |
| `boundary/named-framework` | Next.js, Hono, Express, Fastify, NestJS explicitly named without a framework-agnostic override | app-boundary code in that framework's syntax | unrelated framework syntax or defaulting to Next.js |

Selection rules:

1. If the source pauses for Signals, `step.waitForEvent()`, or `.waitForTaskToken`, pick exactly one resume key.
2. If the target is self-hosted or non-Vercel, also pick `runtime/self-hosted`.
3. Pick exactly one boundary key when the prompt explicitly requests framework-agnostic output or names a framework.
4. A combined prompt can require multiple keys, for example: `resume/url + runtime/self-hosted + boundary/named-framework`.

Before drafting `## Migrated Code`, write the selected route keys in `## Migration Plan`.

### Route-key obligations

Apply every obligation that matches the selected route keys.

- `resume/internal`
  - Workflow code must use `createHook()`.
  - App boundary must call `resumeHook()`.
  - Use a deterministic business token.
  - Do not emit `createWebhook()` or `webhook.url`.
- `resume/url`
  - Workflow code must use `createWebhook({ respondWith: 'manual' })`.
  - External request setup must pass `webhook.url`.
  - In `## App Boundary / Resume Endpoints`, treat the generated `webhook.url` as the resume surface.
  - Callback parsing and `request.respondWith()` must stay inside a `"use step"` function using `RequestWithResponse`.
  - Do not emit `resumeHook(...)`.
  - Do not pass `token:` to `createWebhook()`.
  - Do not invent a user-authored callback route or `resumeWebhook()` wrapper unless the prompt explicitly asks for one.
- `runtime/self-hosted`
  - Include `interface World extends Storage, Queue, Streamer { start?(): Promise<void>; }`.
  - Include `startWorkflowWorld(): Promise<void>`.
  - Include the explicit self-hosted explanation from `references/runtime-targets.md`.
  - Do not claim Vercel-managed execution.
- `boundary/framework-agnostic`
  - Use plain `Request` / `Response`.
- `boundary/named-framework`
  - Use the named framework's syntax for every user-authored app-boundary snippet.
  - This includes `start()` routes and any `resumeHook()` or status endpoints.
  - Do not mix a named framework `start()` route with a plain `Request` / `Response` internal-resume endpoint unless the prompt explicitly asks for framework-agnostic app-boundary code.

Use this exact planning shape:

```md
## Migration Plan
- Source: [Temporal | Inngest | AWS Step Functions]
- Route keys: [comma-separated keys]
- Why these route keys:
  - [route key]: [reason from the prompt]
- Required code obligations:
  - [obligation 1]
  - [obligation 2]
```

**Sample input:**

```md
Migrate this AWS Step Functions approval flow to Vercel Workflow for Hono on self-hosted Postgres.
The external vendor needs a callback URL.
Keep app-boundary code in Hono syntax.
```

Expected `## Migration Plan` excerpt:

```md
## Migration Plan
- Source: AWS Step Functions
- Route keys: resume/url, runtime/self-hosted, boundary/named-framework
- Why these route keys:
  - `resume/url`: external vendor needs a callback URL
  - `runtime/self-hosted`: target says self-hosted Postgres
  - `boundary/named-framework`: prompt asks for Hono syntax
- Required code obligations:
  - use `createWebhook({ respondWith: 'manual' })` and pass `webhook.url`
  - include `World extends Storage, Queue, Streamer` and `startWorkflowWorld()`
  - keep app-boundary code in Hono syntax
```

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
- [ ] A named-framework migration mixes framework syntax for `start()` with plain `Request` / `Response` for a user-authored `resumeHook()` endpoint without a framework-agnostic override
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

```ts
import { Hono } from 'hono';
import { resumeHook } from 'workflow/api';

const app = new Hono();

app.post('/api/refunds/:refundId/approve', async (c) => {
  const refundId = c.req.param('refundId');
  const body = (await c.req.json()) as { approved: boolean };

  await resumeHook(`refund:${refundId}:approval`, {
    approved: body.approved,
  });

  return c.json({ ok: true });
});

export default app;
```

**Sample input:**

```md
Migrate this Temporal approval flow to Vercel Workflow for Hono.
Keep app-boundary code in Hono syntax.
```

**Expected output:**

```md
## Migration Plan
- Source: Temporal
- Route keys: resume/internal, boundary/named-framework
```

```ts
import { Hono } from 'hono';
import { resumeHook } from 'workflow/api';

const app = new Hono();

app.post('/api/orders/:orderId/approve', async (c) => {
  const orderId = c.req.param('orderId');
  const body = (await c.req.json()) as { approved: boolean };

  await resumeHook(`order:${orderId}:approval`, {
    approved: body.approved,
  });

  return c.json({ ok: true });
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
