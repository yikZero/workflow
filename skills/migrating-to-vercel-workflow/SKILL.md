---
name: migrating-to-vercel-workflow
description: Migrates Temporal, Inngest, and AWS Step Functions workflows to Vercel Workflow. Use when porting Activities, Workers, Signals, step.run(), step.waitForEvent(), ASL JSON state machines, Task/Choice/Wait/Parallel states, task tokens, or child workflows.
metadata:
  author: Vercel Inc.
  version: '0.1.1'
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
- When the target framework is unspecified, keep route examples framework-agnostic with `Request` / `Response`. Do not default to Next.js-only handler signatures.

## Resume surface selection

Choose one resume surface and say why inside `## App Boundary / Resume Endpoints`.

### Deterministic server-side resume -> `createHook()` + `resumeHook()`

Use this when the source used Signals, `step.waitForEvent()`, or `.waitForTaskToken`, and your app can resume the workflow from server-side code.

```ts
import { createHook } from 'workflow';
import { resumeHook } from 'workflow/api';

export async function approvalWorkflow(orderId: string) {
  'use workflow';

  using approval = createHook<{ approved: boolean }>({
    token: `order:${orderId}:approval`,
  });

  return await approval;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    orderId: string;
    approved: boolean;
  };

  await resumeHook(`order:${body.orderId}:approval`, {
    approved: body.approved,
  });

  return Response.json({ ok: true });
}
```

### Generated callback URL -> `createWebhook()`

Use this when the external system needs a callback URL and the migrated flow should work with raw `Request` / `Response`.

```ts
import { createWebhook, type RequestWithResponse } from 'workflow';

export async function vendorCallbackWorkflow(documentId: string) {
  'use workflow';

  using webhook = createWebhook({ respondWith: 'manual' });

  await submitDocument(documentId, webhook.url);
  const request = await webhook;
  return await readVendorCallback(request);
}

async function submitDocument(
  documentId: string,
  callbackUrl: string,
): Promise<void> {
  'use step';

  await fetch('https://vendor.example.com/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId, callbackUrl }),
  });
}

async function readVendorCallback(
  request: RequestWithResponse,
): Promise<{ status: 'verified' | 'rejected' }> {
  'use step';

  const body = (await request.json()) as { approved: boolean };
  await request.respondWith(Response.json({ ok: true }));
  return { status: body.approved ? 'verified' : 'rejected' };
}
```

Do not put `token:` on `createWebhook()`.

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
