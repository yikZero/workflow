# Shared migration patterns

## Core rules

- Orchestration -> `"use workflow"`
- Side effects, SDK access, DB access, stream I/O -> `"use step"`
- `sleep()` only in workflow context
- `getWritable()` obtainable in workflow, but interact with stream only in step context
- External side effects -> `getStepMetadata().stepId` as idempotency key
- Child workflows -> step-wrapped `start()` / `getRun()`

## Choosing hook vs webhook

Prefer `createHook()` + `resumeHook()` when:

- the source system used Signals, `step.waitForEvent()`, or `.waitForTaskToken`
- the resume point can be addressed with a deterministic business token such as `order:${orderId}:approval`
- the app will resume the workflow from server-side code

Use `createWebhook()` when:

- the external system should call the generated URL directly
- the migration needs raw `Request` / `Response` handling
- deterministic tokens are not required

Default deterministic-resume pattern:

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

## Webhook callback URL with manual response

```ts
import { createWebhook, type RequestWithResponse } from 'workflow';

export async function verificationWorkflow(documentId: string) {
  'use workflow';

  using webhook = createWebhook({ respondWith: 'manual' });

  await submitForVerification(documentId, webhook.url);
  const request = await webhook;
  return await handleVerificationCallback(request);
}

async function submitForVerification(
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

async function handleVerificationCallback(
  request: RequestWithResponse,
): Promise<{ status: 'verified' | 'rejected'; reviewer?: string }> {
  'use step';

  const body = (await request.json()) as {
    approved: boolean;
    reviewer?: string;
  };
  await request.respondWith(Response.json({ ok: true }));
  return body.approved
    ? { status: 'verified', reviewer: body.reviewer }
    : { status: 'rejected', reviewer: body.reviewer };
}
```

## Hook with timeout

```ts
import { createHook, sleep } from 'workflow';

type Approval = { approved: boolean };

export async function approvalWorkflow(id: string) {
  'use workflow';

  using approval = createHook<Approval>({
    token: `approval:${id}`,
  });

  const result = await Promise.race([
    approval.then((payload) => ({ kind: 'approval' as const, payload })),
    sleep('7d').then(() => ({ kind: 'timeout' as const })),
  ]);

  if (result.kind === 'timeout') {
    return { id, status: 'timed_out' as const };
  }

  return {
    id,
    status: result.payload.approved ? 'approved' : 'rejected',
  };
}
```

Resume endpoint (framework-agnostic):

```ts
import { resumeHook } from 'workflow/api';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    id: string;
    approved: boolean;
  };

  await resumeHook(`approval:${body.id}`, {
    approved: body.approved,
  });

  return Response.json({ ok: true });
}
```

## Child workflow via step-wrapped start/getRun

```ts
import { getRun, start } from 'workflow/api';

export async function childWorkflow(input: string) {
  'use workflow';
  return await doWork(input);
}

async function doWork(input: string) {
  'use step';
  return { input, status: 'done' as const };
}

async function spawnChild(input: string): Promise<string> {
  'use step';
  const run = await start(childWorkflow, [input]);
  return run.runId;
}

async function collectChild(runId: string) {
  'use step';
  const run = getRun(runId);
  return (await run.returnValue) as { input: string; status: 'done' };
}
```

## Idempotent external write

```ts
import { getStepMetadata } from 'workflow';

async function writeOrder(orderId: string) {
  'use step';

  const { stepId } = getStepMetadata();

  await fetch(process.env.ORDER_API_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': stepId,
    },
    body: JSON.stringify({ orderId }),
  });
}
```

## Streaming boundary: obtain in workflow, interact in step

Use:

```ts
import { getWritable } from 'workflow';

export async function refundWorkflow(refundId: string) {
  'use workflow';

  const writable = getWritable<{ stage: string }>();
  await emitStatus(writable, { stage: 'requested' });
  await emitStatus(writable, { stage: 'completed' });
  return { refundId, status: 'done' as const };
}

async function emitStatus(
  writable: WritableStream<{ stage: string }>,
  chunk: { stage: string },
): Promise<void> {
  'use step';

  const writer = writable.getWriter();
  try {
    await writer.write(chunk);
  } finally {
    writer.releaseLock();
  }
}
```

Avoid:

```ts
import { getWritable } from 'workflow';

export async function badWorkflow() {
  'use workflow';

  const writable = getWritable<{ stage: string }>();
  const writer = writable.getWriter(); // ❌ stream interaction in workflow context
  await writer.write({ stage: 'requested' });
}
```

**Sample input:** `Migrate an Inngest workflow that publishes progress and waits for approval.`

**Expected output:** The migration may obtain `getWritable()` in workflow context, but every `getWriter()`, `write()`, and `close()` call remains inside a `"use step"` function.

## Rollback stack

```ts
export async function orderSaga(orderId: string) {
  'use workflow';

  const rollbacks: Array<() => Promise<void>> = [];

  try {
    const reservation = await reserveInventory(orderId);
    rollbacks.push(() => releaseInventory(reservation.id));

    const charge = await chargePayment(orderId);
    rollbacks.push(() => refundPayment(charge.id));

    return { orderId, status: 'completed' as const };
  } catch (error) {
    // Compensate in reverse order
    while (rollbacks.length > 0) {
      await rollbacks.pop()!();
    }
    throw error;
  }
}
```
