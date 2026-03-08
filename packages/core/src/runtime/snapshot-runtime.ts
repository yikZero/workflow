/**
 * Snapshot-based workflow runtime.
 *
 * Instead of replaying the full event log on every invocation, this runtime:
 * 1. Runs workflow code in a QuickJS WASM VM (via quickjs-wasi)
 * 2. Snapshots the VM state when the workflow suspends
 * 3. Restores the VM from the snapshot on resumption
 * 4. Only fetches events since the last snapshot
 *
 * The workflow primitives (useStep, sleep, createHook) are implemented as
 * JavaScript code running inside the QuickJS VM. The host communicates with
 * the VM by evaluating small JS snippets to read pending operations and
 * resolve/reject promises.
 */

import seedrandom from 'seedrandom';
import { QuickJS } from 'quickjs-wasi';
import type { Event, SnapshotMetadata, WorkflowRun } from '@workflow/world';
import { workflow as workflowSerde } from '../serialization/index.js';

// ---- Types ----

export interface PendingStep {
  type: 'step';
  correlationId: string;
  stepId: string;
  /** Format-prefixed devalue-serialized step input (args + closureVars) */
  input: Uint8Array;
  /** Whether a step_created event already exists for this step */
  hasCreatedEvent: boolean;
}

export interface PendingWait {
  type: 'wait';
  correlationId: string;
  /** ISO string of when to resume */
  resumeAt: string;
  /** Whether a wait_created event already exists for this wait */
  hasCreatedEvent: boolean;
}

export type PendingOperation = PendingStep | PendingWait;

export interface SnapshotRuntimeResult {
  /** The workflow completed — result is format-prefixed devalue bytes */
  completed?: { result: Uint8Array };
  /** The workflow suspended with pending operations */
  suspended?: {
    pendingOperations: PendingOperation[];
    snapshot: Uint8Array;
    lastEventId: string | null;
  };
  /** The workflow failed */
  failed?: {
    message: string;
    stack?: string;
    name?: string;
  };
}

export interface SnapshotRuntimeOptions {
  /** The compiled workflow bundle code (workflow mode output from SWC) */
  workflowCode: string;
  /** The workflow ID (e.g. "workflow//./workflows/1_simple//simple") */
  workflowId: string;
  /** The workflow run entity */
  workflowRun: WorkflowRun;
  /** Events to process: all events for first run, delta events for subsequent */
  events: Event[];
  /** Existing snapshot to restore from, or null for first invocation */
  existingSnapshot: {
    data: Uint8Array;
    metadata: SnapshotMetadata;
  } | null;
  /** The WASM module bytes for quickjs-wasi (optional, auto-loaded if omitted) */
  wasm?: ArrayBuffer | Uint8Array;
}

// ---- VM Bootstrap Code ----

/**
 * JavaScript code that runs inside the QuickJS VM to set up the workflow
 * primitives. This sets up:
 * - globalThis.__private_workflows (Map) - workflow registry
 * - globalThis.__resolvers (Object) - pending promise resolve/reject functions
 * - globalThis.__pending (Array) - metadata about pending operations
 * - globalThis[Symbol.for("WORKFLOW_USE_STEP")] - step proxy factory
 * - globalThis[Symbol.for("WORKFLOW_SLEEP")] - sleep function
 */
const VM_BOOTSTRAP = `
globalThis.__private_workflows = new Map();
globalThis.__resolvers = {};
globalThis.__pending = [];
globalThis.__stepCounter = 0;
globalThis.__workflowResult = undefined;
globalThis.__workflowError = undefined;

// Stubs for Web APIs that the workflow bundle may reference but are not
// available in QuickJS. These are only needed if the workflow uses streams,
// which are not yet supported in the snapshot runtime.
if (typeof TransformStream === "undefined") {
  globalThis.TransformStream = function() { throw new Error("TransformStream not supported in snapshot runtime"); };
}
if (typeof ReadableStream === "undefined") {
  globalThis.ReadableStream = function() { throw new Error("ReadableStream not supported in snapshot runtime"); };
}
if (typeof WritableStream === "undefined") {
  globalThis.WritableStream = function() { throw new Error("WritableStream not supported in snapshot runtime"); };
}
if (typeof TextEncoder === "undefined") {
  globalThis.TextEncoder = function() {};
  globalThis.TextEncoder.prototype.encode = function(s) { return new Uint8Array(0); };
}
if (typeof TextDecoder === "undefined") {
  globalThis.TextDecoder = function() {};
  globalThis.TextDecoder.prototype.decode = function() { return ""; };
}
if (typeof Headers === "undefined") {
  globalThis.Headers = function() {};
}
if (typeof URL === "undefined") {
  globalThis.URL = function(u) { this.href = u; this.toString = function() { return u; }; };
}
if (typeof console === "undefined") {
  globalThis.console = { log: function(){}, error: function(){}, warn: function(){}, info: function(){} };
}
// Stub exports/module for CJS bundle format
globalThis.exports = {};
globalThis.module = { exports: globalThis.exports };

globalThis[Symbol.for("WORKFLOW_USE_STEP")] = function(stepId, closureVarsFn) {
  return function() {
    var args = Array.prototype.slice.call(arguments);
    var correlationId = "step_" + (globalThis.__stepCounter++);
    // Serialize step input using the host-provided devalue serializer.
    // This produces a format-prefixed Uint8Array ("devl" + devalue.stringify).
    var input = globalThis.__wdk_serialize({
      args: args,
      closureVars: closureVarsFn ? closureVarsFn() : undefined,
    });
    globalThis.__pending.push({
      type: "step",
      correlationId: correlationId,
      stepId: stepId,
      input: input,
      hasCreatedEvent: false,
    });
    return new Promise(function(resolve, reject) {
      globalThis.__resolvers[correlationId] = { resolve: resolve, reject: reject };
    });
  };
};

globalThis[Symbol.for("WORKFLOW_SLEEP")] = function(param) {
  var correlationId = "wait_" + (globalThis.__stepCounter++);
  var resumeAt;
  if (typeof param === "number") {
    resumeAt = new Date(Date.now() + param).toISOString();
  } else if (typeof param === "string") {
    var match = param.match(/^(\\d+)([smhd])$/);
    if (match) {
      var value = parseInt(match[1]);
      var unit = match[2];
      var ms = value * (unit === "s" ? 1000 : unit === "m" ? 60000 : unit === "h" ? 3600000 : 86400000);
      resumeAt = new Date(Date.now() + ms).toISOString();
    } else {
      resumeAt = new Date(param).toISOString();
    }
  } else if (param instanceof Date) {
    resumeAt = param.toISOString();
  } else {
    throw new Error("Invalid sleep parameter: " + param);
  }
  globalThis.__pending.push({
    type: "wait",
    correlationId: correlationId,
    resumeAt: resumeAt,
    hasCreatedEvent: false,
  });
  return new Promise(function(resolve, reject) {
    globalThis.__resolvers[correlationId] = { resolve: resolve, reject: reject };
  });
};
`;

// ---- Runtime ----

export async function runSnapshotWorkflow(
  options: SnapshotRuntimeOptions
): Promise<SnapshotRuntimeResult> {
  const { workflowCode, workflowId, workflowRun, events, existingSnapshot } =
    options;

  const startedAt = workflowRun.startedAt ? +workflowRun.startedAt : Date.now();

  const seed = `${workflowRun.runId}:${workflowRun.workflowName}:${startedAt}`;
  const rng = seedrandom(seed);

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
      wasm: options.wasm,
      wasi: { now: () => BigInt(startedAt) * 1_000_000n },
      memoryLimit: 64 * 1024 * 1024,
      interruptHandler: createInterruptHandler(),
    });

    // Re-register host functions after restore
    installSerdeHostFunctions(vm);

    // Process delta events
    processEvents(vm, events);
    vm.executePendingJobs();
  } else {
    // ---- FIRST RUN ----
    vm = await QuickJS.create({
      wasm: options.wasm,
      wasi: { now: () => BigInt(startedAt) * 1_000_000n },
      memoryLimit: 64 * 1024 * 1024,
      interruptHandler: createInterruptHandler(),
    });

    // Seeded Math.random
    {
      using randomFn = vm.newFunction('random', () => vm.newNumber(rng()));
      using math = vm.global.getProp('Math');
      math.setProp('random', randomFn);
    }

    // Install serialize/deserialize host functions
    installSerdeHostFunctions(vm);

    // Bootstrap workflow primitives
    vm.unwrapResult(vm.evalCode(VM_BOOTSTRAP, 'bootstrap.js')).dispose();

    // Execute the workflow bundle
    const evalResult = vm.evalCode(workflowCode, 'workflow.js');
    if (evalResult.isException) {
      return extractError(vm, evalResult, 'Workflow evaluation failed');
    }
    evalResult.dispose();

    // Start the workflow function
    const startResult = vm.evalCode(`
      var __wfn = globalThis.__private_workflows.get(${JSON.stringify(workflowId)});
      if (!__wfn) throw new Error("Workflow not found: " + ${JSON.stringify(workflowId)});
      __wfn().then(
        function(result) { globalThis.__workflowResult = globalThis.__wdk_serialize(result); },
        function(error) { globalThis.__workflowError = error.message || String(error); }
      );
    `);
    if (startResult.isException) {
      return extractError(vm, startResult, 'Failed to start workflow');
    }
    startResult.dispose();

    // Process any existing events (replay for first run)
    processEvents(vm, events);
    vm.executePendingJobs();
  }

  // ---- Check result ----
  return checkWorkflowState(vm, lastEventId);
}

// ---- Event Processing ----

function processEvents(vm: QuickJS, events: Event[]): void {
  for (const event of events) {
    const cid = event.correlationId;
    if (!cid) continue;

    const escapedCid = cid.replace(/"/g, '\\"');
    const eventData =
      'eventData' in event
        ? (event.eventData as Record<string, unknown>)
        : undefined;

    switch (event.eventType) {
      case 'step_completed': {
        const rawOutput = eventData?.output;
        if (rawOutput instanceof Uint8Array) {
          // Pass serialized bytes into the VM and deserialize there
          const bytesHandle = vm.newUint8Array(rawOutput);
          vm.setProp(vm.global, '__tmp_result', bytesHandle);
          bytesHandle.dispose();
          vm.unwrapResult(
            vm.evalCode(
              `if(globalThis.__resolvers["${escapedCid}"]){` +
                `globalThis.__resolvers["${escapedCid}"].resolve(globalThis.__wdk_deserialize(globalThis.__tmp_result));` +
                `delete globalThis.__resolvers["${escapedCid}"];` +
                `delete globalThis.__tmp_result;}`
            )
          ).dispose();
        } else {
          // Legacy or plain value
          const serialized =
            rawOutput !== undefined ? JSON.stringify(rawOutput) : 'undefined';
          vm.unwrapResult(
            vm.evalCode(
              `if(globalThis.__resolvers["${escapedCid}"]){` +
                `globalThis.__resolvers["${escapedCid}"].resolve(${serialized});` +
                `delete globalThis.__resolvers["${escapedCid}"];}`
            )
          ).dispose();
        }
        markCreated(vm, escapedCid);
        break;
      }
      case 'step_failed': {
        const errorData = eventData?.error as
          | Record<string, unknown>
          | undefined;
        const msg = (errorData?.message as string) ?? 'Step failed';
        vm.unwrapResult(
          vm.evalCode(
            `if(globalThis.__resolvers["${escapedCid}"]){` +
              `globalThis.__resolvers["${escapedCid}"].reject(new Error(${JSON.stringify(msg)}));` +
              `delete globalThis.__resolvers["${escapedCid}"];}`
          )
        ).dispose();
        markCreated(vm, escapedCid);
        break;
      }
      case 'wait_completed': {
        vm.unwrapResult(
          vm.evalCode(
            `if(globalThis.__resolvers["${escapedCid}"]){` +
              `globalThis.__resolvers["${escapedCid}"].resolve();` +
              `delete globalThis.__resolvers["${escapedCid}"];}`
          )
        ).dispose();
        markCreated(vm, escapedCid);
        break;
      }
      case 'step_created':
      case 'step_started':
      case 'step_retrying':
      case 'wait_created': {
        markCreated(vm, escapedCid);
        break;
      }
    }
  }
}

function markCreated(vm: QuickJS, escapedCid: string): void {
  vm.unwrapResult(
    vm.evalCode(
      `var __p=globalThis.__pending.find(function(p){return p.correlationId==="${escapedCid}";});` +
        `if(__p)__p.hasCreatedEvent=true;`
    )
  ).dispose();
}

// ---- State Checking ----

function checkWorkflowState(
  vm: QuickJS,
  lastEventId: string | null
): SnapshotRuntimeResult {
  // Check completed — __workflowResult is a format-prefixed Uint8Array
  {
    using h = vm.unwrapResult(vm.evalCode('globalThis.__workflowResult'));
    if (!h.isUndefined) {
      const resultBytes = h.toUint8Array();
      vm.dispose();
      return { completed: { result: resultBytes } };
    }
  }

  // Check failed
  {
    using h = vm.unwrapResult(vm.evalCode('globalThis.__workflowError'));
    if (!h.isUndefined) {
      const message = h.toString();
      vm.dispose();
      return { failed: { message } };
    }
  }

  // Check suspended
  {
    using h = vm.unwrapResult(
      vm.evalCode('Object.keys(globalThis.__resolvers).length > 0')
    );
    if (vm.dump(h)) {
      using pendingH = vm.unwrapResult(
        vm.evalCode(
          `globalThis.__pending.filter(function(p){return!!globalThis.__resolvers[p.correlationId];})`
        )
      );
      const pendingOps = vm.dump(pendingH) as PendingOperation[];

      const snapshot = vm.snapshot();
      const serialized = QuickJS.serializeSnapshot(snapshot);
      vm.dispose();

      return {
        suspended: {
          pendingOperations: pendingOps,
          snapshot: serialized,
          lastEventId,
        },
      };
    }
  }

  vm.dispose();
  return { failed: { message: 'Workflow ended in unknown state' } };
}

// ---- Helpers ----

function extractError(
  vm: QuickJS,
  result: ReturnType<QuickJS['evalCode']>,
  fallbackMessage: string
): SnapshotRuntimeResult {
  const exc = vm.getException();
  const error = vm.dump(exc) as Error | null;
  exc.dispose();
  result.dispose();
  vm.dispose();
  return {
    failed: {
      message: error?.message ?? fallbackMessage,
      stack: error?.stack,
      name: error?.name,
    },
  };
}

/**
 * Install __wdk_serialize and __wdk_deserialize as host functions on the VM.
 *
 * __wdk_serialize: takes a JS value, returns a Uint8Array (devl-prefixed devalue)
 * __wdk_deserialize: takes a Uint8Array, returns a JS value
 *
 * These are host functions because the serializer needs devalue which is
 * bundled on the host side. The data stays as opaque Uint8Array blobs in
 * the VM — the actual serialize/deserialize happens on the host via
 * quickjs-wasi's dump()/hostToHandle()/newUint8Array()/toUint8Array().
 */
function installSerdeHostFunctions(vm: QuickJS): void {
  // These are set on globalThis so the VM bootstrap code can call them.
  // On restore, they're re-installed with new callback IDs — the VM
  // code accesses them via globalThis at call time, not at definition time.
  {
    using serializeFn = vm.newFunction('__wdk_serialize', (...args) => {
      const value = vm.dump(args[0]);
      const bytes = workflowSerde.serialize(value);
      return vm.newUint8Array(bytes);
    });
    vm.setProp(vm.global, '__wdk_serialize', serializeFn);
  }
  {
    using deserializeFn = vm.newFunction('__wdk_deserialize', (...args) => {
      const bytes = args[0].toUint8Array();
      const value = workflowSerde.deserialize(bytes);
      return vm.hostToHandle(value);
    });
    vm.setProp(vm.global, '__wdk_deserialize', deserializeFn);
  }
}

function createInterruptHandler(): () => boolean {
  const start = Date.now();
  const timeout = 30_000;
  return () => Date.now() - start > timeout;
}
