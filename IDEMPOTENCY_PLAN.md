# Idempotency for `start()` - Implementation Plan

## Overview

Add idempotency support to `start()` so users can provide an idempotency key when starting workflow runs. If a run with the same key is already **live** (pending/running), return the existing run instead of creating a new one. Once a run completes (completed/failed/cancelled), the idempotency key is "released" and future calls can create new runs.

## Key Design Decisions

### 1. Idempotency Scope: Live Runs Only

Idempotency is enforced **only while a run is live** (status: `pending` or `running`):

- **Live run exists** → Return the existing run (no new run created)
- **No live run** (never existed, or previous run completed/failed/cancelled) → Create a new run

This approach:
- Prevents duplicate concurrent runs (the main use case for idempotency)
- Allows natural retry/restart patterns after completion
- Keeps the DX simple - no special options for handling completed runs
- Lets users handle "previous run completed" logic in their workflow code if needed

### 2. User Workflow Code Handles Completion Checks

If users need to know whether a previous run with the same idempotency key completed:

```ts
"use workflow";

export async function processOrder(orderId: string) {
  // User can check for previous completions in their workflow logic
  const previousResult = await checkPreviousOrderProcessing(orderId);
  if (previousResult) {
    return previousResult; // Return cached result
  }
  
  // ... process the order
}
```

This is more flexible than framework-level options because:
- Users control the exact behavior
- Can check external systems, databases, etc.
- Can decide on case-by-case basis whether to reuse results

### 3. Run Entity Indicates Existing vs New

The `Run` object returned from `start()` will include an `existing` boolean:

```ts
interface Run<T> {
  runId: string;
  existing: boolean; // true if an existing run was returned due to idempotency
  // ... existing methods
}
```

This lets callers know if they got a new run or an existing one.

---

## API Changes

### `StartOptions` (packages/core/src/runtime/start.ts)

```ts
export interface StartOptions {
  // ... existing options ...
  
  /**
   * Idempotency key for deduplicating concurrent workflow starts.
   * 
   * When provided:
   * - If a run with this key is currently live (pending/running), that run is returned
   * - If no live run exists with this key, a new run is created
   * 
   * The key is scoped to the workflow name and deployment. Once a run completes
   * (completed/failed/cancelled), the key is released and can be reused.
   * 
   * Common patterns:
   * - Use a business entity ID (e.g., orderId, userId) to prevent duplicate processing
   * - Use a request ID to make webhook handlers idempotent
   */
  idempotencyKey?: string;
}
```

### `Run` class (packages/core/src/runtime/run.ts)

```ts
export class Run<TResult> {
  readonly runId: string;
  
  /**
   * Whether this run was returned from an existing run due to idempotency.
   * - `true`: An existing live run was found and returned
   * - `false`: A new run was created (default)
   */
  readonly existing: boolean;
  
  constructor(runId: string, existing: boolean = false) {
    this.runId = runId;
    this.existing = existing;
  }
  
  // ... existing methods
}
```

---

## Storage Changes

### Database Schema

Add idempotency key column to runs table:

```sql
-- Migration: Add idempotency_key to runs table
ALTER TABLE runs 
ADD COLUMN idempotency_key VARCHAR(255);

-- Partial unique index: only enforce uniqueness for live runs
-- This allows completed runs to share the same idempotency key
CREATE UNIQUE INDEX idx_runs_idempotency_live 
ON runs (workflow_name, idempotency_key) 
WHERE status IN ('pending', 'running') AND idempotency_key IS NOT NULL;
```

The partial unique index is key - it only enforces uniqueness for live runs, automatically "releasing" the key when runs complete.

### WorkflowRun Type (packages/world/src/runs.ts)

```ts
export const WorkflowRunBaseSchema = z.object({
  // ... existing fields ...
  
  /**
   * Optional idempotency key for deduplicating workflow starts.
   * Only unique among live runs (pending/running) for the same workflow.
   */
  idempotencyKey: z.string().optional(),
});
```

### Event Schema (packages/world/src/events.ts)

```ts
const RunCreatedEventSchema = BaseEventSchema.extend({
  eventType: z.literal('run_created'),
  eventData: z.object({
    // ... existing fields ...
    
    /** Optional idempotency key for deduplication */
    idempotencyKey: z.string().optional(),
  }),
});
```

---

## World Interface Changes

### EventResult Enhancement

```ts
export interface EventResult {
  // ... existing fields ...
  
  /**
   * Whether the run was newly created or an existing run was returned.
   * Only relevant for run_created events with idempotency keys.
   */
  existingRun?: boolean;
}
```

### Create Event Behavior

When `events.create()` receives a `run_created` event with an `idempotencyKey`:

1. Check for existing live run with same `(workflowName, idempotencyKey)`
2. If found → Return `{ run: existingRun, existingRun: true }` (no event created)
3. If not found → Create new run as normal with `existingRun: false`

---

## Implementation Changes

### 1. packages/core/src/runtime/start.ts

```ts
export async function start<TArgs extends unknown[], TResult>(
  workflow: WorkflowFunction<TArgs, TResult> | WorkflowMetadata,
  argsOrOptions?: TArgs | StartOptions,
  options?: StartOptions
) {
  // ... existing code ...
  
  const result = await world.events.create(
    runId,
    {
      eventType: 'run_created',
      specVersion,
      eventData: {
        deploymentId: deploymentId,
        workflowName: workflowName,
        input: workflowArguments,
        executionContext: { traceCarrier, workflowCoreVersion },
        idempotencyKey: opts.idempotencyKey, // NEW: pass idempotency key
      },
    },
    { v1Compat }
  );
  
  // If existing run was returned due to idempotency, skip queueing
  if (result.existingRun) {
    return new Run<TResult>(result.run!.runId, true /* existing */);
  }
  
  // ... existing queue logic for new runs ...
  
  return new Run<TResult>(runId, false /* new */);
}
```

### 2. packages/world-postgres/src/storage.ts

```ts
async createRunCreatedEvent(
  runId: string | null,
  data: RunCreatedEventRequest,
  params?: CreateEventParams
): Promise<EventResult> {
  const { idempotencyKey, workflowName } = data.eventData;
  
  // If idempotency key provided, check for existing live run
  if (idempotencyKey) {
    const existingRun = await this.findLiveRunByIdempotencyKey(
      workflowName,
      idempotencyKey
    );
    
    if (existingRun) {
      // Return existing run without creating new event
      return {
        run: existingRun,
        existingRun: true,
      };
    }
  }
  
  // Create new run with idempotency key
  // The partial unique index handles race conditions
  try {
    const run = await this.insertRun({
      // ... existing fields ...
      idempotencyKey,
    });
    
    return {
      event,
      run,
      existingRun: false,
    };
  } catch (error) {
    // Handle race condition: another request created the run
    if (isUniqueConstraintViolation(error)) {
      const existingRun = await this.findLiveRunByIdempotencyKey(
        workflowName,
        idempotencyKey!
      );
      if (existingRun) {
        return {
          run: existingRun,
          existingRun: true,
        };
      }
    }
    throw error;
  }
}
```

### 3. packages/world-vercel/src/events.ts

Similar changes to call the Vercel API with idempotency key support.

---

## Migration Path

1. **Schema migration**: Add `idempotency_key` column with partial unique index
2. **World packages**: Update to handle idempotencyKey in event creation
3. **Core package**: Update `start()` to pass idempotencyKey and handle existing runs
4. **Tests**: Add comprehensive tests for idempotency scenarios

---

## Test Scenarios

1. **Basic idempotency**: Two concurrent starts with same key → same run returned
2. **Different keys**: Two starts with different keys → two separate runs
3. **Key release on completion**: Start with key, run completes, start again → new run
4. **Key release on failure**: Start with key, run fails, start again → new run
5. **Key release on cancellation**: Start with key, run cancelled, start again → new run
6. **No key**: Start without key → always creates new run (existing behavior)
7. **Race condition**: Concurrent starts hit unique constraint → both get same run
8. **Cross-workflow**: Same key for different workflows → separate runs (keys scoped to workflow)

---

## Example Usage

```ts
import { start } from "workflow";
import { processOrder } from "./workflows/order";

// Idempotent order processing
async function handleOrderWebhook(orderId: string, orderData: OrderData) {
  const run = await start(processOrder, [orderId, orderData], {
    idempotencyKey: `order-${orderId}`,
  });
  
  if (run.existing) {
    console.log(`Order ${orderId} already being processed (run ${run.runId})`);
  } else {
    console.log(`Started processing order ${orderId} (run ${run.runId})`);
  }
  
  return run;
}
```

---

## Open Questions

1. **Key format/validation**: Should we enforce a max length or character set for idempotency keys?
   - Recommendation: Max 255 chars, alphanumeric + common separators (-, _, :)

2. **Key scoping**: Currently scoped to `(workflowName, idempotencyKey)`. Should deploymentId be included?
   - Recommendation: No, keep it simple. Users can include deployment info in the key if needed.

3. **TTL for idempotency**: Should there be a time limit for how long a completed run "holds" its key slot?
   - Recommendation: No, the partial index handles this naturally. Completed runs don't hold the slot at all.
