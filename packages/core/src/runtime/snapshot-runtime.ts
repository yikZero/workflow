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
import { VM_SERDE_BUNDLE } from './vm-serde-bundle.generated.js';

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

export interface PendingHook {
  type: 'hook';
  correlationId: string;
  token: string;
  isWebhook: boolean;
  metadata?: unknown;
  hasCreatedEvent: boolean;
}

export interface PendingHookDispose {
  type: 'hook_dispose';
  correlationId: string;
  hasCreatedEvent: boolean;
}

export type PendingOperation =
  | PendingStep
  | PendingWait
  | PendingHook
  | PendingHookDispose;

export interface SnapshotRuntimeResult {
  /** The workflow completed — result is format-prefixed devalue bytes */
  completed?: { result: Uint8Array };
  /** The workflow suspended with pending operations */
  suspended?: {
    pendingOperations: PendingOperation[];
    snapshot: Uint8Array;
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
// Symbol.dispose / Symbol.asyncDispose polyfills for QuickJS
if (typeof Symbol.dispose === "undefined") {
  Symbol.dispose = Symbol.for("Symbol.dispose");
}
if (typeof Symbol.asyncDispose === "undefined") {
  Symbol.asyncDispose = Symbol.for("Symbol.asyncDispose");
}

globalThis.__private_workflows = new Map();
globalThis.__resolvers = {};
globalThis.__pending = [];
globalThis.__stepCounter = 0;
globalThis.__workflowResult = undefined;
globalThis.__workflowError = undefined;

// Stubs for Web APIs that the workflow bundle may reference but are not
// available in QuickJS. These are lightweight polyfills, not full
// Web API implementations.

// NOTE: Headers polyfill is provided by the VM serde bundle (via esbuild inject),
// which is evaluated before this bootstrap code.

if (typeof ReadableStream === "undefined") {
  // Minimal ReadableStream that stores body data for Response.json()/text()
  globalThis.ReadableStream = function() {};
  globalThis.ReadableStream.prototype.__bodyData = null;
}

if (typeof WritableStream === "undefined") {
  globalThis.WritableStream = function() {};
}

if (typeof TransformStream === "undefined") {
  globalThis.TransformStream = function() {};
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
// NOTE: TextEncoder/TextDecoder polyfills are provided by the VM serde bundle,
// which is evaluated before this bootstrap code.

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

// Response/Request polyfills — .json()/.text()/.arrayBuffer() are useStep
// proxies that execute on the host side (same pattern as workflow.ts).
if (typeof Response === "undefined") {
  var __resJson = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("__builtin_response_json");
  var __resText = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("__builtin_response_text");
  var __resArrayBuffer = globalThis[Symbol.for("WORKFLOW_USE_STEP")]("__builtin_response_array_buffer");
  var __BODY_INIT = Symbol.for("BODY_INIT");

  globalThis.Response = function(body, init) {
    init = init || {};
    this.status = init.status || 200;
    this.statusText = init.statusText || "";
    this.headers = new globalThis.Headers(init.headers || []);
    this.type = "default";
    this.url = "";
    this.redirected = false;
    if (body !== null && body !== undefined) {
      this.body = Object.create(globalThis.ReadableStream.prototype);
      this.body[__BODY_INIT] = body;
    } else {
      this.body = null;
    }
  };
  Object.defineProperty(globalThis.Response.prototype, "ok", {
    get: function() { return this.status >= 200 && this.status < 300; }
  });
  Object.defineProperty(globalThis.Response.prototype, "bodyUsed", {
    get: function() { return false; }
  });
  globalThis.Response.prototype.json = function() { return __resJson(this); };
  globalThis.Response.prototype.text = function() { return __resText(this); };
  globalThis.Response.prototype.arrayBuffer = function() { return __resArrayBuffer(this); };
  globalThis.Response.prototype.bytes = function() {
    return __resArrayBuffer(this).then(function(buf) { return new Uint8Array(buf); });
  };
  globalThis.Response.prototype.clone = function() {
    var r = Object.create(globalThis.Response.prototype);
    r.status = this.status; r.statusText = this.statusText;
    r.headers = this.headers; r.type = this.type;
    r.url = this.url; r.redirected = this.redirected; r.body = this.body;
    return r;
  };
  globalThis.Response.json = function(data, init) {
    var body = JSON.stringify(data);
    var headers = new globalThis.Headers(init ? init.headers : []);
    if (!headers.has("content-type")) { headers.set("content-type", "application/json"); }
    return new globalThis.Response(body, { status: (init && init.status) || 200, statusText: (init && init.statusText) || "", headers: headers });
  };
}
if (typeof Request === "undefined") {
  globalThis.Request = function(input, init) {
    init = init || {};
    if (typeof input === "string") { this.url = input; }
    else if (input && typeof input === "object") {
      this.url = input.url || ""; this.method = input.method;
      this.headers = input.headers; this.body = input.body;
    }
    if (init.method) this.method = init.method.toUpperCase();
    if (!this.method) this.method = "GET";
    if (init.headers) this.headers = new globalThis.Headers(init.headers);
    if (!this.headers) this.headers = new globalThis.Headers();
    if (init.body !== undefined) this.body = init.body;
    if (!this.body) this.body = null;
    this.duplex = init.duplex || "half";
  };
  Object.defineProperty(globalThis.Request.prototype, "bodyUsed", {
    get: function() { return false; }
  });
  globalThis.Request.prototype.json = function() { return __resJson(this); };
  globalThis.Request.prototype.text = function() { return __resText(this); };
  globalThis.Request.prototype.arrayBuffer = function() { return __resArrayBuffer(this); };
}

// createHook — returns a Hook object that is both a Thenable and AsyncIterable.
// Each await/yield creates a new promise keyed by the same correlationId.
// The promise is resolved when a hook_received event arrives.
globalThis[Symbol.for("WORKFLOW_CREATE_HOOK")] = function(options) {
  options = options || {};
  var token = options.token || ("tok_" + (globalThis.__stepCounter++));
  var correlationId = "hook_" + (globalThis.__stepCounter++);
  var isDisposed = false;
  var hasCreatedEvent = false;

  // Register in pending operations
  globalThis.__pending.push({
    type: "hook",
    correlationId: correlationId,
    token: token,
    isWebhook: !!options.isWebhook,
    metadata: options.metadata,
    hasCreatedEvent: false,
  });

  // Each await creates a new promise for the next payload.
  // The correlationId stays the same — the resolver is replaced each time.
  function createHookPromise() {
    return new Promise(function(resolve, reject) {
      globalThis.__resolvers[correlationId] = { resolve: resolve, reject: reject };
    });
  }

  function disposeHook() {
    if (isDisposed) return;
    isDisposed = true;
    // Signal to the entrypoint to create a hook_disposed event
    globalThis.__pending.push({
      type: "hook_dispose",
      correlationId: correlationId,
      hasCreatedEvent: false,
    });
    // If there's a pending resolver, resolve it with undefined to break the iterator
    if (globalThis.__resolvers[correlationId]) {
      globalThis.__resolvers[correlationId].resolve(undefined);
      delete globalThis.__resolvers[correlationId];
    }
  }

  var hook = {
    token: token,
    then: function(onFulfilled, onRejected) {
      return createHookPromise().then(onFulfilled, onRejected);
    },
    dispose: disposeHook,
  };

  // Symbol.dispose for explicit resource management
  hook[Symbol.dispose] = disposeHook;

  // AsyncIterable — yields payloads until disposed
  hook[Symbol.asyncIterator] = function() {
    return {
      next: function() {
        if (isDisposed) {
          return Promise.resolve({ done: true, value: undefined });
        }
        return createHookPromise().then(function(value) {
          // If disposed while waiting, signal done
          if (isDisposed) return { done: true, value: undefined };
          return { done: false, value: value };
        });
      },
      return: function() {
        disposeHook();
        return Promise.resolve({ done: true, value: undefined });
      },
    };
  };

  return hook;
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

  let vm: QuickJS;

  if (existingSnapshot) {
    // ---- RESTORE from snapshot ----
    const snapshot = QuickJS.deserializeSnapshot(existingSnapshot.data);
    vm = await QuickJS.restore(snapshot, {
      wasm: options.wasm,
      // Use real time for Date.now() — determinism is handled by seeded Math.random
      memoryLimit: 64 * 1024 * 1024,
      interruptHandler: createInterruptHandler(),
    });

    // Note: __wdk_serialize/__wdk_deserialize are JS functions in the VM
    // (set by the serde bundle), so they survive snapshot/restore as part
    // of the QuickJS heap. No re-registration needed.

    // Process delta events
    processEvents(vm, events);
    // Run pending jobs in a loop until no more are enqueued.
    // Promise chains (especially async functions with multiple awaits)
    // may enqueue new microtasks as previous ones complete.
    let batch: number;
    do {
      batch = vm.executePendingJobs();
    } while (batch > 0);
  } else {
    // ---- FIRST RUN ----
    vm = await QuickJS.create({
      wasm: options.wasm,
      // Use real time for Date.now() — determinism is handled by seeded Math.random
      memoryLimit: 64 * 1024 * 1024,
      interruptHandler: createInterruptHandler(),
    });

    // Seeded Math.random
    {
      using randomFn = vm.newFunction('random', () => vm.newNumber(rng()));
      using math = vm.global.getProp('Math');
      math.setProp('random', randomFn);
    }

    // Evaluate the VM serde bundle
    vm.unwrapResult(vm.evalCode(VM_SERDE_BUNDLE, 'vm-serde.js')).dispose();

    // DEBUG: Write workflowCode to temp file for inspection
    try {
      require('fs').writeFileSync(
        '/tmp/workflow-bundle-debug.js',
        workflowCode
      );
    } catch {}

    // Bootstrap workflow primitives
    vm.unwrapResult(vm.evalCode(VM_BOOTSTRAP, 'bootstrap.js')).dispose();

    // Execute the workflow bundle
    const evalResult = vm.evalCode(workflowCode, 'workflow.js');
    if (evalResult.isException) {
      return extractError(vm, evalResult, 'Workflow evaluation failed');
    }
    evalResult.dispose();

    // Extract workflow arguments from the run_created event
    const runCreatedEvent = events.find((e) => e.eventType === 'run_created');
    const runInput =
      runCreatedEvent && 'eventData' in runCreatedEvent
        ? (runCreatedEvent.eventData as Record<string, unknown>)?.input
        : undefined;

    // Pass the serialized input into the VM for deserialization
    if (runInput instanceof Uint8Array) {
      const inputHandle = vm.newUint8Array(runInput);
      vm.setProp(vm.global, '__wdk_input', inputHandle);
      inputHandle.dispose();
    }

    // Set workflow context metadata (for getWorkflowMetadata())
    {
      const metadata = {
        workflowName: workflowRun.workflowName,
        workflowRunId: workflowRun.runId,
        workflowStartedAt: workflowRun.startedAt
          ? new Date(+workflowRun.startedAt)
          : new Date(),
        url: process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : `http://localhost:${process.env.PORT ?? 3000}`,
      };
      vm.unwrapResult(
        vm.evalCode(
          `globalThis[Symbol.for("WORKFLOW_CONTEXT")] = ${JSON.stringify(metadata)};` +
            `globalThis[Symbol.for("WORKFLOW_CONTEXT")].workflowStartedAt = new Date(${JSON.stringify(metadata.workflowStartedAt.toISOString())});`
        )
      ).dispose();
    }

    // Start the workflow function
    const startResult = vm.evalCode(`
      var __wfn = globalThis.__private_workflows.get(${JSON.stringify(workflowId)});
      if (!__wfn) throw new Error("Workflow not found: " + ${JSON.stringify(workflowId)});
      var __args = globalThis.__wdk_input
        ? globalThis.__wdk_deserialize(globalThis.__wdk_input)
        : [];
      delete globalThis.__wdk_input;
      if (!Array.isArray(__args)) __args = [__args];
      __wfn.apply(null, __args).then(
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
    {
      let batch: number;
      do {
        batch = vm.executePendingJobs();
      } while (batch > 0);
    }
  }

  // ---- Check result ----
  return checkWorkflowState(vm);
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

    // Log the event and whether the resolver exists
    switch (event.eventType) {
      case 'step_completed': {
        const hasResolver = vm.dump(
          vm.unwrapResult(
            vm.evalCode(`!!globalThis.__resolvers["${escapedCid}"]`)
          )
        );
        const rawOutput = eventData?.result ?? eventData?.output;
        if (hasResolver) {
          if (rawOutput instanceof Uint8Array) {
            const bytesHandle = vm.newUint8Array(rawOutput);
            vm.setProp(vm.global, '__tmp_result', bytesHandle);
            bytesHandle.dispose();
            vm.unwrapResult(
              vm.evalCode(
                `globalThis.__resolvers["${escapedCid}"].resolve(globalThis.__wdk_deserialize(globalThis.__tmp_result));` +
                  `delete globalThis.__resolvers["${escapedCid}"];` +
                  `delete globalThis.__tmp_result;`
              )
            ).dispose();
          } else {
            const serialized =
              rawOutput !== undefined ? JSON.stringify(rawOutput) : 'undefined';
            vm.unwrapResult(
              vm.evalCode(
                `globalThis.__resolvers["${escapedCid}"].resolve(${serialized});` +
                  `delete globalThis.__resolvers["${escapedCid}"];`
              )
            ).dispose();
          }
          // Drain ALL microtasks after resolve
          {
            let b: number;
            do {
              b = vm.executePendingJobs();
            } while (b > 0);
          }
        }
        markCreated(vm, escapedCid);
        break;
      }
      case 'step_failed': {
        const hasResolver = vm.dump(
          vm.unwrapResult(
            vm.evalCode(`!!globalThis.__resolvers["${escapedCid}"]`)
          )
        );
        if (hasResolver) {
          const errorData = eventData?.error as
            | Record<string, unknown>
            | undefined;
          const msg = (errorData?.message as string) ?? 'Step failed';
          vm.unwrapResult(
            vm.evalCode(
              `globalThis.__resolvers["${escapedCid}"].reject(new Error(${JSON.stringify(msg)}));` +
                `delete globalThis.__resolvers["${escapedCid}"];`
            )
          ).dispose();
          {
            let b: number;
            do {
              b = vm.executePendingJobs();
            } while (b > 0);
          }
        }
        markCreated(vm, escapedCid);
        break;
      }
      case 'wait_completed': {
        const hasResolver = vm.dump(
          vm.unwrapResult(
            vm.evalCode(`!!globalThis.__resolvers["${escapedCid}"]`)
          )
        );
        if (hasResolver) {
          vm.unwrapResult(
            vm.evalCode(
              `globalThis.__resolvers["${escapedCid}"].resolve();` +
                `delete globalThis.__resolvers["${escapedCid}"];`
            )
          ).dispose();
          {
            let b: number;
            do {
              b = vm.executePendingJobs();
            } while (b > 0);
          }
        }
        markCreated(vm, escapedCid);
        break;
      }
      case 'hook_received': {
        const hasResolver = vm.dump(
          vm.unwrapResult(
            vm.evalCode(`!!globalThis.__resolvers["${escapedCid}"]`)
          )
        );
        if (hasResolver) {
          const rawPayload = eventData?.payload ?? eventData?.result;
          if (rawPayload instanceof Uint8Array) {
            const bytesHandle = vm.newUint8Array(rawPayload);
            vm.setProp(vm.global, '__tmp_result', bytesHandle);
            bytesHandle.dispose();
            vm.unwrapResult(
              vm.evalCode(
                `globalThis.__resolvers["${escapedCid}"].resolve(globalThis.__wdk_deserialize(globalThis.__tmp_result));` +
                  `delete globalThis.__resolvers["${escapedCid}"];` +
                  `delete globalThis.__tmp_result;`
              )
            ).dispose();
          } else {
            const serialized =
              rawPayload !== undefined
                ? JSON.stringify(rawPayload)
                : 'undefined';
            vm.unwrapResult(
              vm.evalCode(
                `globalThis.__resolvers["${escapedCid}"].resolve(${serialized});` +
                  `delete globalThis.__resolvers["${escapedCid}"];`
              )
            ).dispose();
          }
          {
            let b: number;
            do {
              b = vm.executePendingJobs();
            } while (b > 0);
          }
        }
        markCreated(vm, escapedCid);
        break;
      }
      case 'hook_conflict': {
        const hasResolver = vm.dump(
          vm.unwrapResult(
            vm.evalCode(`!!globalThis.__resolvers["${escapedCid}"]`)
          )
        );
        if (hasResolver) {
          vm.unwrapResult(
            vm.evalCode(
              `globalThis.__resolvers["${escapedCid}"].reject(new Error("Hook token conflict"));` +
                `delete globalThis.__resolvers["${escapedCid}"];`
            )
          ).dispose();
          {
            let b: number;
            do {
              b = vm.executePendingJobs();
            } while (b > 0);
          }
        }
        markCreated(vm, escapedCid);
        break;
      }
      case 'step_created':
      case 'step_started':
      case 'step_retrying':
      case 'wait_created':
      case 'hook_created':
      case 'hook_disposed': {
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

function checkWorkflowState(vm: QuickJS): SnapshotRuntimeResult {
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

function createInterruptHandler(): () => boolean {
  const start = Date.now();
  const timeout = 30_000;
  return () => Date.now() - start > timeout;
}
