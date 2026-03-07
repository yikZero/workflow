/**
 * Snapshot-based workflow runtime.
 *
 * Instead of replaying the full event log on every invocation, this runtime:
 * 1. Runs workflow code in a QuickJS WASM VM (via quickjs-wasi)
 * 2. Snapshots the VM state when the workflow suspends
 * 3. Restores the VM from the snapshot on resumption
 * 4. Only fetches events since the last snapshot
 *
 * This is an alternative to the event-replay runtime in workflow.ts.
 */

import seedrandom from 'seedrandom';
import { QuickJS } from 'quickjs-wasi';
import type { Event, SnapshotMetadata, WorkflowRun } from '@workflow/world';

// ---- Types ----

interface PendingOperation {
  type: 'step' | 'hook' | 'wait';
  correlationId: string;
  /** The resolve function handle stored in the VM (for resolving after restore) */
  resolveCallbackId: number;
  /** The reject function handle stored in the VM */
  rejectCallbackId: number;
  /** Step-specific metadata */
  stepMetadata?: {
    stepId: string;
    stepName: string;
  };
  /** Wait-specific metadata */
  waitMetadata?: {
    resumeAt: Date;
  };
  /** Hook-specific metadata */
  hookMetadata?: {
    token?: string;
  };
}

export interface SnapshotRuntimeResult {
  /** The workflow completed with this result */
  completed?: unknown;
  /** The workflow suspended with these pending operations */
  suspended?: {
    pendingOperations: PendingOperation[];
    snapshot: Uint8Array;
    lastEventId: string | null;
  };
  /** The workflow failed with this error */
  failed?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

export interface SnapshotRuntimeOptions {
  /** The compiled workflow bundle code (workflow mode output from SWC) */
  workflowCode: string;
  /** The workflow run entity */
  workflowRun: WorkflowRun;
  /** All events for the run (first invocation) or delta events (subsequent) */
  events: Event[];
  /** Existing snapshot to restore from, or null for first invocation */
  existingSnapshot: {
    data: Uint8Array;
    metadata: SnapshotMetadata;
  } | null;
  /** The WASM module bytes for quickjs-wasi */
  wasm?: ArrayBuffer | Uint8Array;
  /** Encryption key for data, if enabled */
  encryptionKey?: unknown;
}

// ---- Runtime ----

/**
 * Execute a workflow using the snapshot-based runtime.
 */
export async function runSnapshotWorkflow(
  options: SnapshotRuntimeOptions
): Promise<SnapshotRuntimeResult> {
  const { workflowCode, workflowRun, events, existingSnapshot, wasm } = options;

  const startedAt = workflowRun.startedAt ? +workflowRun.startedAt : Date.now();

  // Deterministic seed (same as the event-replay runtime)
  const seed = `${workflowRun.runId}:${workflowRun.workflowName}:${startedAt}`;
  const rng = seedrandom(seed);

  // Track pending operations (correlationId -> deferred info)
  const pendingOperations = new Map<string, PendingOperation>();

  // Track the last event ID we've processed
  let lastEventId: string | null =
    existingSnapshot?.metadata.lastEventId ?? null;
  for (const event of events) {
    lastEventId = event.eventId;
  }

  let vm: QuickJS;

  if (existingSnapshot) {
    // ---- RESTORE from snapshot ----
    const snapshot = QuickJS.deserializeSnapshot(existingSnapshot.data);
    vm = await QuickJS.restore(snapshot, {
      wasm,
      wasi: {
        now: () => BigInt(startedAt) * 1_000_000n,
      },
      memoryLimit: 64 * 1024 * 1024, // 64 MB
      interruptHandler: createInterruptHandler(),
    });

    // Re-register host callbacks
    // TODO: re-register useStep, createHook, sleep callbacks
    // TODO: read __pendingOps from VM to rebuild pendingOperations map
    // TODO: process delta events to resolve pending promises
  } else {
    // ---- FIRST RUN: create fresh VM ----
    vm = await QuickJS.create({
      wasm,
      wasi: {
        now: () => BigInt(startedAt) * 1_000_000n,
      },
      memoryLimit: 64 * 1024 * 1024, // 64 MB
      interruptHandler: createInterruptHandler(),
    });

    // Override Math.random with seeded PRNG
    {
      using randomFn = vm.newFunction('random', () => vm.newNumber(rng()));
      using math = vm.global.getProp('Math');
      math.setProp('random', randomFn);
    }

    // Install workflow primitives on globalThis via symbols
    installWorkflowPrimitives(vm, pendingOperations, rng);

    // Execute the workflow bundle
    const evalResult = vm.evalCode(workflowCode, 'workflow.js');
    if (evalResult.isException) {
      const exc = vm.getException();
      const error = vm.dump(exc) as Error;
      exc.dispose();
      evalResult.dispose();
      vm.dispose();
      return {
        failed: {
          message: error.message ?? 'Workflow evaluation failed',
          stack: error.stack,
          name: error.name,
        },
      };
    }
    evalResult.dispose();

    // Execute pending jobs (microtasks from the workflow code)
    vm.executePendingJobs();
  }

  // Check if the workflow completed or suspended
  if (pendingOperations.size === 0) {
    // Workflow completed — extract the result
    // TODO: read the workflow return value from the VM
    vm.dispose();
    return { completed: undefined };
  }

  // Workflow suspended — snapshot the VM
  const snapshot = vm.snapshot();
  const serialized = QuickJS.serializeSnapshot(snapshot);
  vm.dispose();

  return {
    suspended: {
      pendingOperations: Array.from(pendingOperations.values()),
      snapshot: serialized,
      lastEventId,
    },
  };
}

// ---- Host function installations ----

function installWorkflowPrimitives(
  vm: QuickJS,
  pendingOperations: Map<string, PendingOperation>,
  rng: seedrandom.PRNG
) {
  // useStep: globalThis[Symbol.for("WORKFLOW_USE_STEP")]
  {
    using sym = vm.newSymbolFor('WORKFLOW_USE_STEP');
    // The useStep function returns a function that, when called with args,
    // creates a step invocation and returns a promise
    using useStepFactory = vm.newFunction('useStep', function (...args) {
      const stepId = args[0].toString();

      // Return a function that, when called, creates the step invocation
      using innerFn = vm.newFunction(`step_${stepId}`, function (..._stepArgs) {
        const correlationId = `step_${generateUlid(rng)}`;
        const deferred = vm.newPromise();

        // TODO: Store resolve/reject handles on __resolvers global for
        // retrieval after snapshot restore

        pendingOperations.set(correlationId, {
          type: 'step',
          correlationId,
          resolveCallbackId: 0, // TODO
          rejectCallbackId: 0, // TODO
          stepMetadata: {
            stepId,
            stepName: stepId, // TODO: resolve actual step name
          },
        });

        return deferred.handle;
      });

      return innerFn.dup();
    });
    vm.setProp(vm.global, sym, useStepFactory);
  }

  // sleep: globalThis[Symbol.for("WORKFLOW_SLEEP")]
  {
    using sym = vm.newSymbolFor('WORKFLOW_SLEEP');
    using sleepFn = vm.newFunction('sleep', function (..._args) {
      // TODO: parse duration, create wait invocation, return promise
      return vm.getUndefined();
    });
    vm.setProp(vm.global, sym, sleepFn);
  }

  // createHook: globalThis[Symbol.for("WORKFLOW_CREATE_HOOK")]
  {
    using sym = vm.newSymbolFor('WORKFLOW_CREATE_HOOK');
    using createHookFn = vm.newFunction('createHook', function (..._args) {
      // TODO: create hook invocation, return hook object
      return vm.newObject();
    });
    vm.setProp(vm.global, sym, createHookFn);
  }
}

// ---- Helpers ----

function createInterruptHandler(): () => boolean {
  const start = Date.now();
  const timeout = 30_000; // 30 second timeout
  return () => Date.now() - start > timeout;
}

function generateUlid(_rng: seedrandom.PRNG): string {
  // TODO: implement deterministic ULID generation using the seeded RNG
  // For now, use a simple counter-based approach
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
