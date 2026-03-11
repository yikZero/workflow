# V2 Combined Bundle Architecture

## Overview

Replace the current two-route architecture (`/.well-known/workflow/v1/flow` + `/.well-known/workflow/v1/step`) with a single combined route at `/.well-known/workflow/v2/flow` that handles both workflow orchestration and step execution. This reduces function invocations and queue overhead by executing steps inline when possible.

## Current Architecture (V1)

```
Queue: __wkf_workflow_*  ──▶  /v1/flow   (workflow replay in VM)
                                │
                          suspension
                                │
                          queue steps to __wkf_step_*
                                │
Queue: __wkf_step_*      ──▶  /v1/step   (step execution in Node.js)
                                │
                          step completes
                                │
                          queue back to __wkf_workflow_*
                                ▼
                          (cycle repeats)
```

Each step requires 2 queue messages (step invoke + workflow continuation) and 2 function invocations, plus cold start overhead for each.

## Proposed Architecture (V2)

```
Queue: __wkf_workflow_*  ──▶  /v2/flow  (combined handler)
                                │
                          ┌─────┴─────┐
                          │ stepId in  │
                          │ message?   │
                          └─────┬─────┘
                           no   │   yes
                          ┌─────┴─────────────────────┐
                          ▼                           ▼
                    replay workflow          execute step directly
                          │                   then replay workflow
                          │                           │
                          └───────────┬───────────────┘
                                      │
                                suspension
                                      │
                          ┌───────────┴───────────┐
                          │  how many pending     │
                          │  steps?               │
                          └───────────┬───────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                  ▼
                 0 steps          1 step            N steps
              (waits/hooks     execute it         queue N-1 to self
               only — handle   inline, then       (with stepId),
               normally)       loop back to       execute 1 inline,
                               replay             loop back to replay
```

### Inline Execution Loop

The combined handler runs a loop:

```
receive message
  │
  ├─ if stepId in message: execute step, create step_completed event
  │
  ▼
replay workflow (VM)
  │
  ├─ workflow completed → create run_completed, exit
  ├─ workflow failed → create run_failed, exit
  │
  ▼
suspension with pending operations
  │
  ├─ process hooks first (same as today)
  ├─ process waits (same as today)
  │
  ├─ 0 pending steps → return (waits/hooks only, queue handles re-invocation)
  ├─ 1 pending step → execute inline, loop back to replay
  ├─ N pending steps → queue N-1 with stepId, execute 1 inline, loop back to replay
  │
  ├─ at any loop iteration: check elapsed wall-clock time
  │   if >= 2 minutes → re-schedule self via queue, ack current message, exit
  │
  ▼
(loop continues until completion, timeout, or non-step suspension)
```

---

## Components Requiring Changes

### 1. Queue Message Schema (`packages/world/src/queue.ts`)

Add optional `stepId` to `WorkflowInvokePayload`:

```typescript
export const WorkflowInvokePayloadSchema = z.object({
  runId: z.string(),
  traceCarrier: TraceCarrierSchema.optional(),
  requestedAt: z.coerce.date().optional(),
  serverErrorRetryCount: z.number().int().optional(),
  // V2: Optional step ID for inline step execution
  stepId: z.string().optional(),
});
```

This is backward-compatible: V1 messages without `stepId` still work.

### 2. Combined Runtime Entrypoint (`packages/core/src/runtime.ts`)

New export: `combinedEntrypoint(workflowCode: string)`.

This is the core of the change. Pseudocode:

```typescript
export function combinedEntrypoint(workflowCode: string) {
  const handler = getWorldHandlers().createQueueHandler(
    '__wkf_workflow_',
    async (message_, metadata) => {
      const { runId, stepId, traceCarrier, ... } = parse(message_);
      const workflowName = metadata.queueName.slice('__wkf_workflow_'.length);
      const world = getWorld();
      const startTime = Date.now();
      const TIMEOUT_MS = 110_000; // ~2 minutes, with buffer

      // If message contains stepId, execute that step first
      if (stepId) {
        await executeStepInline(world, runId, workflowName, stepId);
      }

      // Enter the replay loop
      while (true) {
        // Check timeout
        if (Date.now() - startTime >= TIMEOUT_MS) {
          await queueMessage(world, getWorkflowQueueName(workflowName), {
            runId,
            traceCarrier: await serializeTraceCarrier(),
            requestedAt: new Date(),
          });
          return; // ack current message
        }

        // Standard workflow replay (same as current workflowEntrypoint)
        const result = await replayWorkflow(world, runId, workflowCode);

        if (result.type === 'completed' || result.type === 'failed') {
          return; // done
        }

        if (result.type === 'suspension') {
          const { suspension } = result;

          // Process hooks and waits (same as today)
          await handleHooksAndWaits(suspension, world, run);

          const pendingSteps = suspension.steps.filter(s => s.type === 'step');

          if (pendingSteps.length === 0) {
            // Only waits/hooks - return timeout for queue re-delivery
            return computeWaitTimeout(suspension);
          }

          // Create step_created events for all pending steps
          await createStepEvents(pendingSteps, world, runId, suspension);

          if (pendingSteps.length === 1) {
            // Execute the single step inline
            await executeStepInline(world, runId, workflowName, pendingSteps[0]);
            continue; // loop back to replay
          }

          // Multiple steps: queue N-1, execute 1 inline
          const [inlineStep, ...backgroundSteps] = pendingSteps;
          await queueBackgroundSteps(backgroundSteps, world, workflowName, runId);
          await executeStepInline(world, runId, workflowName, inlineStep);
          continue; // loop back to replay
        }
      }
    }
  );
  return withHealthCheck(handler);
}
```

**Key internal function**: `executeStepInline()` — performs the same work as the current step handler:
1. Create `step_started` event
2. Hydrate input from event log
3. Look up step function via `getStepFunction(stepName)`
4. Execute step function
5. Create `step_completed` or `step_failed` event
6. Handle retries (re-queue to self with stepId for retry, or retry inline if immediate)

This function should be extracted from the current `step-handler.ts` into a shared module that both the V1 step handler and V2 combined handler can use.

### 3. Suspension Handler (`packages/core/src/runtime/suspension-handler.ts`)

Needs refactoring. Currently, `handleSuspension` both creates events AND queues step messages. For V2:

- **Extract**: `createSuspensionEvents()` — creates hook/step/wait events without queuing
- **Extract**: `queueStepMessages()` — queues step messages to `__wkf_step_*` (V1 only)
- The V2 combined handler calls `createSuspensionEvents()` then decides inline vs background

The existing `handleSuspension()` can remain as-is for V1 compatibility, calling both internally.

### 4. Step Handler Refactoring (`packages/core/src/runtime/step-handler.ts`)

Extract the step execution logic into a reusable function:

```typescript
// New: shared step execution logic
export async function executeStep(params: {
  world: World;
  workflowRunId: string;
  workflowName: string;
  workflowStartedAt: number;
  stepId: string;
  stepName: string;
}): Promise<StepExecutionResult> {
  // Current step handler logic: step_started → hydrate → execute → step_completed
}
```

The existing `stepEntrypoint` becomes a thin wrapper that parses the queue message and calls `executeStep()`. The V2 combined handler also calls `executeStep()` for inline execution.

### 5. SWC Plugin (`packages/swc-plugin-workflow/`)

**New mode: `"combined"`** (or reuse existing modes differently)

The combined bundle needs both:
- Step function bodies preserved and registered via `registerStepFunction()` (step mode behavior)
- Workflow function bodies preserved and registered via `globalThis.__private_workflows.set()` (workflow mode behavior)

**Option A — New combined SWC mode:**
Add a `"combined"` mode that preserves both step and workflow function bodies. Step functions get `registerStepFunction()`. Workflow functions get `globalThis.__private_workflows.set()`.

**Option B — Two-pass build (recommended):**
Keep the existing SWC modes. Build two separate bundles as today, then combine them in the builder:
- The step bundle (compiled with mode `"step"`) provides the step registrations and runs in Node.js context
- The workflow bundle (compiled with mode `"workflow"`) is embedded as a string for VM execution
- The combined route imports both

This avoids touching the Rust SWC plugin. The builder simply generates a different route file that imports both bundles.

**Recommendation: Option B.** The two-pass approach is simpler and doesn't require Rust changes. The workflow code must run in a VM regardless (for determinism/sandboxing), so it always needs to be a separate string bundle. The step code runs in Node.js. The only change is how the route file wires them together.

### 6. Builder: Combined Bundle (`packages/builders/src/base-builder.ts`)

New method: `createCombinedBundle()`:

```typescript
protected async createCombinedBundle({
  inputFiles,
  outfile,
  tsconfigPath,
  discoveredEntries,
}: { ... }) {
  // 1. Build steps bundle (same as createStepsBundle, but don't export POST)
  //    Instead, just register step functions as side effects
  const { manifest: stepsManifest } = await this.createStepsBundle({
    inputFiles,
    outfile: join(dirname(outfile), '__steps_internal.js'),
    ...
  });

  // 2. Build workflow VM bundle (same as createWorkflowsBundle interim)
  const { manifest: workflowManifest } = await this.createWorkflowsBundle({
    inputFiles,
    outfile: join(dirname(outfile), '__workflow_internal.js'),
    bundleFinalOutput: false,
    ...
  });

  // 3. Generate combined route file
  const combinedCode = `
    import 'workflow/internal/builtins';
    import './__steps_internal.js';      // registers step functions
    import { combinedEntrypoint } from 'workflow/runtime';

    const workflowCode = \`${workflowBundleCode}\`;
    export const POST = combinedEntrypoint(workflowCode);
  `;
  await writeFile(outfile, combinedCode);
}
```

Alternatively, the steps registration imports can be inlined into the combined route file directly (virtual entry), which is cleaner and avoids the intermediate file.

### 7. Queue Trigger Configuration (`packages/builders/src/constants.ts`)

New trigger for combined route:

```typescript
export const COMBINED_QUEUE_TRIGGER = {
  type: 'queue/v2beta' as const,
  topic: '__wkf_workflow_*',   // Same topic as before
  consumer: 'default',
  maxDeliveries: 64,
  retryAfterSeconds: 5,
  initialDelaySeconds: 0,
};
```

The separate `STEP_QUEUE_TRIGGER` is no longer needed for V2 deployments. Background steps are queued back to `__wkf_workflow_*` with a `stepId`.

### 8. Next.js Integration (`packages/next/src/builder-eager.ts`)

Update `build()` to generate V2 route:

```typescript
async build() {
  const outputDir = await this.findAppDirectory();
  const workflowGeneratedDir = join(outputDir, '.well-known/workflow/v2');
  // ...
  await this.buildCombinedFunction(options); // replaces buildStepsFunction + buildWorkflowsFunction
  await this.buildWebhookRoute({ workflowGeneratedDir });
  // ...
}
```

The `writeFunctionsConfig()` method needs updating to only emit one trigger:

```typescript
const generatedConfig = {
  version: '0',
  combined: {
    experimentalTriggers: [COMBINED_QUEUE_TRIGGER],
  },
};
```

### 9. Other Framework Integrations

Same pattern applies to:
- `packages/nest/src/builder.ts` — NestJS
- `packages/sveltekit/src/builder.ts` — SvelteKit
- `packages/cli/` — CLI standalone mode
- Any other framework packages (Astro, Nitro, Nuxt)

### 10. Local World (`packages/world-local/`)

The local world already processes steps synchronously. V2 combined execution should work naturally. The `createQueueHandler` for local world may need to understand the new `stepId` field in workflow messages. Verify that the local queue handler routes messages correctly.

### 11. E2E Tests (`packages/core/e2e/`)

All existing e2e tests need to pass against the V2 route. Consider:
- Running tests against both V1 and V2 routes during migration
- Adding V2-specific tests for inline execution, timeout re-scheduling, and multi-step parallel handling

### 12. Workbench Apps

- `workbench/example/` — CLI mode, update if needed
- `workbench/nextjs-turbopack/` — Primary test target, update to V2
- Other workbenches — Update to V2

---

## Concerns

### C1: Workflow VM Sandboxing Must Be Preserved

The workflow code MUST still run in a VM for determinism. The combined bundle doesn't change this — workflow code is still a string passed to `vm.runInContext()`. Step functions run in the Node.js host context as before. The only change is that both happen within the same function invocation.

### C2: Step Function Resolution at Runtime

When the combined handler receives a queue message with `stepId`, it needs to look up the step function by name. The step functions are registered via `registerStepFunction()` at module load time (side effects of importing the step bundle). The `getStepFunction(stepName)` lookup works the same as in V1.

**Risk**: If the combined route is loaded but the step registration imports haven't executed yet (e.g., due to lazy loading or tree shaking), step functions won't be found. The builder must ensure step imports are always eagerly evaluated. Verify that esbuild doesn't tree-shake the side-effect imports.

### C3: Bundle Size and Cold Start

The combined bundle is larger than either individual bundle (it contains both step code AND workflow code). This increases cold start time.

**Mitigation**: The reduction in total function invocations and queue round-trips should more than compensate. A workflow with 10 steps currently requires ~21 function invocations (1 initial + 10 steps + 10 continuations). With V2, a serial workflow could complete in 1-2 invocations.

### C4: 2-Minute Timeout Tracking

The timeout needs to account for total wall-clock time, not just replay time. The loop measures `Date.now() - startTime` at each iteration before starting a new replay+step cycle. Use a conservative threshold (e.g., 110 seconds for a 120-second limit) to allow time for cleanup.

**Edge case**: What if a single step execution takes > 2 minutes? The step itself doesn't have a timeout mechanism — it runs until completion, error, or SIGKILL. This is the same as V1 and doesn't change.

**Edge case**: What if the replay itself takes > 2 minutes? This would mean the event log is extremely large. The timeout check happens between loop iterations, so we can't interrupt a running replay. Consider adding periodic time checks inside the event consumer for very long replays.

### C5: Parallel Steps (`Promise.all`)

When a workflow uses `Promise.all([stepA(), stepB(), stepC()])`, the suspension contains 3 pending steps. The handler:
1. Creates `step_created` events for all 3
2. Queues 2 to background (with stepId, back to `__wkf_workflow_*`)
3. Executes 1 inline
4. When inline step completes, replays workflow
5. Workflow still suspends (waiting for other 2 steps)
6. Handler returns with timeout for waits/hooks or simply exits (the background steps will trigger re-invocations when they complete)

This works correctly because:
- Each background step invocation creates `step_completed`/`step_failed` events
- Each background step invocation queues a workflow continuation (message without stepId)
- The workflow replay picks up all completed step events
- `Promise.all` resolves when all steps have events in the log

**Concern**: There's a race condition where multiple concurrent invocations all try to "continue" the workflow. This is the same as V1 — the queue handler is idempotent and handles concurrent invocations safely via event-sourced architecture (409 Conflict responses).

**Optimization**: When replaying after inline step completion and finding more pending steps (the other steps from Promise.all are still running), the handler should NOT queue more background steps — they're already running. The `hasCreatedEvent` flag on `StepInvocationQueueItem` already handles this: steps with created events are not re-queued.

### C6: Step Retries in Inline Execution

When an inline step fails and has retries remaining:
- **Option A**: Retry inline immediately (faster, uses existing invocation)
- **Option B**: Re-schedule via queue with delay (consistent with V1 retry semantics, respects `RetryableError.retryAfter`)

**Recommendation**: Use Option B for `RetryableError` with explicit `retryAfter` delay. Use Option A for immediate retries (transient errors) to maximize inline execution benefit. Count retries against the same `maxRetries` limit.

For `FatalError`, fail immediately (same as V1).

### C7: Backward Compatibility and Migration

V1 and V2 routes must coexist:
- V1 routes (`/.well-known/workflow/v1/flow` + `/step`) remain functional
- V2 route (`/.well-known/workflow/v2/flow`) is opt-in initially
- Existing workflow runs started on V1 continue processing on V1
- New runs can be started on V2
- The queue topic remains `__wkf_workflow_*` — same topic, different route handlers

**Migration path**:
1. Phase 1: Ship V2 as opt-in (config flag or env var)
2. Phase 2: Make V2 the default for new projects
3. Phase 3: Deprecate V1 route generation

**Concern**: During migration, a V2 deployment queues background steps back to `__wkf_workflow_*` with a `stepId`. If a subsequent deployment rolls back to V1, the V1 handler receives a message with `stepId` it doesn't understand. The V1 handler should ignore unknown fields (Zod `parse` strips extra fields by default, but if using `passthrough()`, verify).

Mitigation: Use `z.parse()` (not `passthrough`) in V1 so unknown fields are stripped. The V1 handler will process the message as a normal workflow invocation (replay + handle suspension), which is safe because the step_created event already exists in the log.

### C8: Observability Impact

V1 creates distinct trace spans for each step invocation (separate function invocation = separate trace). V2 groups multiple step executions under one function invocation.

**Changes needed**:
- Create child spans for each inline step execution within the combined handler
- Maintain the same semantic conventions (`STEP ${stepName}`, attempt tracking)
- Log which steps were executed inline vs. queued to background
- Track loop iteration count in span attributes

### C9: `waitUntil` Usage

The current suspension handler uses `waitUntil()` from `@vercel/functions` to ensure async operations complete even if the function would exit. In the V2 loop, `waitUntil` is still needed for:
- Background step queue messages (fire-and-forget)
- Event creation operations that complete after the handler returns

The inline execution path does NOT use `waitUntil` for the step itself — it awaits the step directly.

### C10: Encryption Key Resolution

Currently, encryption keys are resolved per-run in both the workflow handler and step handler. In the V2 combined handler, the key should be resolved once and reused across the loop iterations.

---

## Edge Cases

### E1: Suspension with Mixed Operations

A suspension may contain steps, hooks, AND waits simultaneously. Example:
```typescript
const [stepResult, hookData] = await Promise.all([
  myStep(),
  myHook, // waiting for external webhook
]);
```

The handler must:
1. Create events for all operations (steps, hooks, waits)
2. Execute the step inline (if only 1 step)
3. Return with timeout for the wait/hook (so the queue re-invokes when wait elapses or hook is received)

After inline step completes, replay the workflow. The workflow will still suspend because the hook hasn't been received yet.

### E2: Hook Conflicts During Inline Loop

If a hook conflict is detected during suspension handling, the current code re-enqueues the workflow immediately (`timeoutSeconds: 0`). In the V2 loop, this should break the loop and return, allowing the queue to re-invoke immediately.

### E3: Step-Only Suspensions After Step Execution

After executing a step inline and replaying, the workflow may immediately suspend with another step. This is the common case for serial workflows:

```typescript
const a = await step1();
const b = await step2(a);
const c = await step3(b);
```

First invocation: replay → suspend(step1) → execute step1 inline → replay → suspend(step2) → execute step2 inline → replay → suspend(step3) → execute step3 inline → replay → workflow completes. **All in one function invocation.**

### E4: `run_completed` or `run_failed` After Step Execution

After inline step execution, replay may find the workflow has completed or failed. Handle this the same as the current workflow handler (create terminal event, return).

### E5: Event Log Corruption / Unconsumed Events

The event consumer detects unconsumed events (events that no callback claims). In V2, this can happen if:
- A step was queued to background and completed, creating a `step_completed` event
- Meanwhile, the inline loop advanced the workflow past that point
- On next replay, the `step_completed` event has no matching subscriber

This shouldn't happen because the event consumer processes events sequentially and each `step_completed` matches a specific `correlationId`. But verify with tests.

### E6: Long-Running Steps and Timeout

If a step takes 90 seconds and the timeout threshold is 110 seconds, the handler has 20 seconds left after the step completes. Not enough for another full step cycle? The timeout check at the top of the loop will catch this and re-schedule.

### E7: Re-Scheduling Self vs. Queue Ack

When re-scheduling self due to timeout:
1. Queue a new message to `__wkf_workflow_*` (same as current retry)
2. Return normally (ack the current message)

This is safe because:
- The new message triggers a fresh invocation
- The current invocation has already persisted any step results
- The event log is the source of truth

If the function is SIGKILL'd before queuing the new message, the current queue message will time out and be re-delivered (at-least-once guarantee).

### E8: Nested Steps in Promise.race

```typescript
const result = await Promise.race([
  longStep(),
  sleep("30s"),
]);
```

The suspension contains both a step and a wait. The handler creates events for both, executes the step inline. If the step completes before 30s, the workflow continues. If the sleep elapses first (checked on next replay), the workflow continues with the sleep result and the step's result is ignored when it eventually arrives.

### E9: Start of Run (First Invocation)

The first invocation for a new run:
1. Message has no `stepId`
2. Run status is `pending` → transition to `running`
3. Event log is empty → replay hits first step immediately
4. Execute inline, continue loop

This is the expected fast path for serial workflows.

### E10: Multiple Steps Queued to Background Compete for Next Invocation

When N-1 steps are queued to background, each will independently:
1. Execute as a separate function invocation (combined handler with `stepId`)
2. After step completion, replay the workflow
3. Potentially find more steps to execute

Multiple concurrent invocations will attempt to advance the same workflow. This is safe due to:
- Event-sourced architecture (duplicate events get 409)
- Idempotent step execution (step_started validates state)
- At-most-once step execution (step in terminal state skipped)

---

## Implementation Plan

### Phase 1: Core Runtime (no builder changes)

1. Add `stepId` to `WorkflowInvokePayloadSchema`
2. Extract step execution logic from `step-handler.ts` into shared module
3. Refactor `suspension-handler.ts` to separate event creation from queuing
4. Implement `combinedEntrypoint()` in `runtime.ts`
5. Unit test the combined handler with mock world

### Phase 2: Builder Integration

6. Add `createCombinedBundle()` to `base-builder.ts`
7. Add `COMBINED_QUEUE_TRIGGER` to `constants.ts`
8. Update Next.js builder (`builder-eager.ts`, `builder-deferred.ts`)
9. Update functions config generation

### Phase 3: Framework Integrations

10. Update NestJS, SvelteKit, CLI, and other framework builders
11. Update `withWorkflow()` config to support V2 route
12. Update local world for V2 message handling

### Phase 4: Testing and Migration

13. E2E tests for V2 route (all existing scenarios)
14. Performance benchmarks (invocation count, latency)
15. Migration guide for existing users
16. Feature flag for V2 opt-in

### Phase 5: Cleanup

17. Deprecation warnings for V1
18. Remove V1 code generation (major version bump)

---

## Open Questions

1. **Should V2 keep the separate step queue (`__wkf_step_*`) as a fallback?** If inline execution fails (e.g., step function not found in combined bundle), should it fall back to queuing to a separate step handler? This adds complexity but improves resilience.

2. **What should the timeout threshold be?** 110 seconds (for 120s limit) leaves 10s buffer. Should this be configurable? On Vercel, function timeout varies by plan (10s, 60s, 300s, 900s). The threshold should be `functionTimeout - buffer`.

3. **Should inline step execution respect `RetryableError.retryAfter` delays?** Sleeping inline wastes compute. Queuing to self with delay is more efficient but adds a queue round-trip. Recommendation: queue to self with delay for any retry delay > 1s.

4. **How should this interact with Fluid Compute?** Fluid Compute already optimizes function invocations. Does inline step execution provide additional benefits on top of Fluid, or does it conflict?

5. **Should the combined handler process hook disposals inline too?** Currently hooks are processed in the suspension handler. In V2, if a hook is disposed and the workflow immediately suspends on a step, should we process the disposal before executing the step inline? Yes — hook disposals are lightweight and should be processed immediately.

6. **How to handle the `workflowStartedAt` timestamp for inline steps?** Currently, `StepInvokePayload` includes `workflowStartedAt` for timeout tracking in the step handler. For inline execution, this is available from the workflow run entity. No change needed, but verify the value is consistent.
