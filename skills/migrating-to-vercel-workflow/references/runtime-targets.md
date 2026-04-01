# Runtime targets

## Use Vercel-managed execution when

- The app is deploying on Vercel.
- The user wants zero-config workflow storage, queueing, and streaming.

Guidance:

- Start workflows from the app boundary with `start()`.
- Retrieve runs later with `getRun()`.
- Do not invent custom `World` code unless the task requires it.

## Use a custom World when

- The app is self-hosted.
- The app is not deploying on Vercel.
- The task explicitly asks for custom infrastructure.

State this explicitly in the migration output:

- The workflow and step code can stay the same.
- The app still needs a `World` implementation for storage, queueing, and streaming.
- The server startup path must call `await getWorld().start?.()` when the selected world requires background workers.

Minimum interface to mention:

```ts
interface World extends Storage, Queue, Streamer {
  start?(): Promise<void>;
}
```

Bootstrap example for self-hosted runtimes:

```ts
import { getWorld } from 'workflow/runtime';

export async function startWorkflowWorld(): Promise<void> {
  await getWorld().start?.();
}
```

## Required responsibilities

- **Storage** for runs, steps, hooks, waits, and the event log.
- **Queueing** for workflow and step invocations.
- **Streaming** for readable/writable workflow streams.

## Non-Vercel output block

When the target is self-hosted or otherwise non-Vercel, include this explanation almost verbatim:

> The workflow and step code can stay the same. Because this target is self-hosted, the app still needs a `World` implementation for storage, queueing, and streaming, plus a startup path that calls `await getWorld().start?.()` when the selected world runs background workers.

Framework-agnostic app boundary:

```ts
import { start } from 'workflow/api';
import { onboardingWorkflow } from '../workflows/onboarding';

export async function POST(request: Request) {
  const body = (await request.json()) as { userId: string };
  const run = await start(onboardingWorkflow, [body.userId]);
  return Response.json({ runId: run.runId });
}
```

Startup bootstrap:

```ts
import { getWorld } from 'workflow/runtime';

export async function startWorkflowWorld(): Promise<void> {
  await getWorld().start?.();
}
```

**Sample input:** `We are migrating a Temporal workflow to Vercel Workflow on Hono with self-hosted Postgres.`

**Expected output:** The migration explicitly says the workflow/step code can stay the same, includes `World extends Storage, Queue, Streamer`, shows `startWorkflowWorld(): Promise<void>`, and keeps the route example on plain `Request`/`Response` rather than Next.js-only syntax.

## Framework rule

If the target framework is named, shape app-boundary examples to that framework.

If the target framework is **not** named, keep examples framework-agnostic with `Request` / `Response`. Do not default to Next.js-only route signatures unless Next.js is explicitly named.
