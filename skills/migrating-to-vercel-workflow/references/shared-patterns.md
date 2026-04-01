# Shared migration patterns

## Core rules

- Orchestration -> `"use workflow"`
- Side effects, SDK access, DB access, stream I/O -> `"use step"`
- `sleep()` only in workflow context
- `getWritable()` obtainable in workflow, but interact with stream only in step context
- External side effects -> `getStepMetadata().stepId` as idempotency key
- Child workflows -> step-wrapped `start()` / `getRun()`

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

## Progress streaming

```ts
import { getWritable } from 'workflow';

export async function streamingWorkflow() {
  'use workflow';

  // Obtain stream in workflow context
  const writable = getWritable();

  // Pass to step for interaction
  await emitProgress(writable, 'started');
  await emitProgress(writable, 'completed');
}

async function emitProgress(writable: WritableStream, stage: string) {
  'use step';

  const writer = writable.getWriter();
  try {
    await writer.write(new TextEncoder().encode(stage));
  } finally {
    writer.releaseLock();
  }
}
```

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
