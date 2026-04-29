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

import type { Span } from '@opentelemetry/api';
import type {
  Event,
  RunInput,
  SnapshotMetadata,
  WorkflowRun,
} from '@workflow/world';
import * as nanoid from 'nanoid';
import { JSException, QuickJS } from 'quickjs-wasi';
import seedrandom from 'seedrandom';
import type { CryptoKey } from '../encryption.js';
import { runtimeLogger } from '../logger.js';
import { decrypt as decryptData } from '../serialization/encryption.js';
import * as Attribute from '../telemetry/semantic-conventions.js';
import { quickjsExtensions, quickjsWasm } from './quickjs-assets.generated.js';
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
  /** Encryption key for decrypting event payloads (undefined if unencrypted) */
  encryptionKey?: CryptoKey;
  /**
   * The local port the workflow server is listening on, used to populate
   * `workflowMetadata.url`. Resolved at call time on the host side so the
   * VM doesn't have to probe the filesystem. Ignored on Vercel — VERCEL_URL
   * takes precedence there.
   */
  port?: number;
  /**
   * Fallback workflow input from the queue message's resilient-start
   * payload. Used when the fetched event log lacks a `run_created` event
   * (eventually-consistent read after the parent's start() wrote it).
   */
  runInput?: RunInput;
  /**
   * Parent OTel span (the outer `WORKFLOW {workflowName}` span). When
   * provided, VM serialize / deserialize timing attributes are attached
   * to it for end-to-end visibility.
   */
  parentSpan?: Span;
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
globalThis.__workflowResult = undefined;
globalThis.__workflowError = undefined;
// Buffer for hook_received payloads that arrive before the hook is awaited.
// Keyed by correlationId → array of payloads (preserves delivery order).
// This mirrors the event-replay runtime's payloadsQueue in hook.ts.
globalThis.__hookPayloadBuffer = {};

// Stubs for Web APIs that the workflow bundle may reference but are not
// available in QuickJS. Native C extensions (encoding, base64, headers,
// url, structuredClone) provide the real implementations; these are
// minimal stubs for APIs that don't have native extensions yet.

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

if (typeof console === "undefined") {
  globalThis.console = { log: function(){}, error: function(){}, warn: function(){}, info: function(){} };
}
// Stub exports/module for CJS bundle format
globalThis.exports = {};
globalThis.module = { exports: globalThis.exports };
// NOTE: TextEncoder/TextDecoder are provided by the native encoding extension.

globalThis[Symbol.for("WORKFLOW_USE_STEP")] = function(stepId, closureVarsFn) {
  var fn = function() {
    var args = Array.prototype.slice.call(arguments);
    var correlationId = "step_" + globalThis.__generateUlid();
    // Capture 'this' for method invocations (e.g., MyClass.method())
    var thisVal = (this !== undefined && this !== null && this !== globalThis) ? this : undefined;
    // Serialize step input using the host-provided devalue serializer.
    // This produces a format-prefixed Uint8Array ("devl" + devalue.stringify).
    var input = globalThis.__wdk_serialize({
      args: args,
      closureVars: closureVarsFn ? closureVarsFn() : undefined,
      thisVal: thisVal,
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
  // Set stepId on the proxy so the StepFunction reducer can detect and
  // serialize step function references (e.g. when passed as arguments).
  fn.stepId = stepId;
  if (closureVarsFn) fn.__closureVarsFn = closureVarsFn;
  return fn;
};

// Parses an "ms" library style duration string into milliseconds.
// Supports the same units as the replay runtime (which uses the "ms"
// package): ms / s / m / h / d / w / y, with verbose aliases
// (seconds, minutes, ...).
globalThis.__parseDurationMs = function(str) {
  str = String(str);
  if (str.length > 100) return undefined;
  var match = str.match(
    /^(-?(?:\\d+)?\\.?\\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i
  );
  if (!match) return undefined;
  var n = parseFloat(match[1]);
  var type = (match[2] || "ms").toLowerCase();
  var s = 1000, m = 60 * s, h = 60 * m, d = 24 * h, w = 7 * d, y = 365.25 * d;
  switch (type) {
    case "years": case "year": case "yrs": case "yr": case "y": return n * y;
    case "weeks": case "week": case "w": return n * w;
    case "days": case "day": case "d": return n * d;
    case "hours": case "hour": case "hrs": case "hr": case "h": return n * h;
    case "minutes": case "minute": case "mins": case "min": case "m": return n * m;
    case "seconds": case "second": case "secs": case "sec": case "s": return n * s;
    case "milliseconds": case "millisecond": case "msecs": case "msec": case "ms": return n;
    default: return undefined;
  }
};

globalThis[Symbol.for("WORKFLOW_SLEEP")] = function(param) {
  var correlationId = "wait_" + globalThis.__generateUlid();
  var resumeAt;
  if (typeof param === "number") {
    resumeAt = new Date(Date.now() + param).toISOString();
  } else if (typeof param === "string") {
    var ms = globalThis.__parseDurationMs(param);
    if (typeof ms === "number" && isFinite(ms)) {
      resumeAt = new Date(Date.now() + ms).toISOString();
    } else {
      // Not a duration string — try as an absolute date string.
      var date = new Date(param);
      if (isNaN(date.getTime())) {
        throw new Error("Invalid sleep parameter: " + param);
      }
      resumeAt = date.toISOString();
    }
  } else if (param instanceof Date) {
    if (isNaN(param.getTime())) {
      throw new Error("Invalid sleep parameter: " + param);
    }
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
// proxies that execute on the host side. The proxies are assigned directly
// to the prototypes so that 'this' (the Response/Request instance) is
// serialized as thisVal by WORKFLOW_USE_STEP, matching the event-replay
// runtime's approach (commit dcb0761).
if (typeof Response === "undefined") {
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
  // Assign useStep proxies directly — 'this' binding provides the
  // Response instance, which gets serialized as thisVal by the proxy.
  Object.defineProperties(globalThis.Response.prototype, {
    arrayBuffer: { value: globalThis[Symbol.for("WORKFLOW_USE_STEP")]("__builtin_response_array_buffer"), writable: true, configurable: true },
    json: { value: globalThis[Symbol.for("WORKFLOW_USE_STEP")]("__builtin_response_json"), writable: true, configurable: true },
    text: { value: globalThis[Symbol.for("WORKFLOW_USE_STEP")]("__builtin_response_text"), writable: true, configurable: true },
  });
  globalThis.Response.prototype.bytes = function() {
    return this.arrayBuffer().then(function(buf) { return new Uint8Array(buf); });
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
  Object.defineProperties(globalThis.Request.prototype, {
    arrayBuffer: { value: globalThis[Symbol.for("WORKFLOW_USE_STEP")]("__builtin_response_array_buffer"), writable: true, configurable: true },
    json: { value: globalThis[Symbol.for("WORKFLOW_USE_STEP")]("__builtin_response_json"), writable: true, configurable: true },
    text: { value: globalThis[Symbol.for("WORKFLOW_USE_STEP")]("__builtin_response_text"), writable: true, configurable: true },
  });
}

// createHook — returns a Hook object that is both a Thenable and AsyncIterable.
// Each await/yield creates a new promise keyed by the same correlationId.
// The promise is resolved when a hook_received event arrives.
globalThis[Symbol.for("WORKFLOW_CREATE_HOOK")] = function(options) {
  options = options || {};
  var token = options.token || globalThis.__generateNanoid();
  var correlationId = "hook_" + globalThis.__generateUlid();
  var isDisposed = false;
  var hasCreatedEvent = false;

  // Register in pending operations.
  // Serialize metadata inside the VM so Response/Request objects are
  // properly handled by the devalue reducers before crossing the boundary.
  globalThis.__pending.push({
    type: "hook",
    correlationId: correlationId,
    token: token,
    isWebhook: !!options.isWebhook,
    metadata: options.metadata ? globalThis.__wdk_serialize(options.metadata) : undefined,
    hasCreatedEvent: false,
  });

  // Each await creates a new promise for the next payload.
  // The correlationId stays the same — the resolver is replaced each time.
  function createHookPromise() {
    // Check the payload buffer first — if a hook_received event arrived
    // before this hook was awaited, the payload was buffered in the VM
    // heap. Drain it immediately (matching event-replay payloadsQueue).
    var buf = globalThis.__hookPayloadBuffer[correlationId];
    if (buf && buf.length > 0) {
      return Promise.resolve(buf.shift());
    }
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

// WORKFLOW_GET_STREAM_ID — generates a stream ID for a workflow run.
// Replicates getWorkflowRunStreamId() from util.ts inside the QuickJS VM.
// Uses native btoa() from the base64 extension for base64url encoding.
globalThis[Symbol.for("WORKFLOW_GET_STREAM_ID")] = function(namespace) {
  var runId = globalThis[Symbol.for("WORKFLOW_CONTEXT")]
    ? globalThis[Symbol.for("WORKFLOW_CONTEXT")].workflowRunId
    : "";
  var streamId = runId.replace("wrun_", "strm_") + "_user";
  if (!namespace) return streamId;
  // base64url: btoa then replace + with -, / with _, strip =
  var b64 = btoa(namespace).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  return streamId + "_" + b64;
};
`;

// ---- Runtime ----

export async function runSnapshotWorkflow(
  options: SnapshotRuntimeOptions
): Promise<SnapshotRuntimeResult> {
  const { workflowCode, workflowId, workflowRun, events, existingSnapshot } =
    options;

  const startedAt = workflowRun.startedAt ? +workflowRun.startedAt : Date.now();

  // Mix the snapshot's events cursor into the PRNG seed so that each
  // resumption draws from a different point in the sequence. Without this,
  // every restore re-initialized the RNG from the same `runId:name:startedAt`
  // seed and replayed the first-N draws, producing identical correlationIds
  // across resumptions and breaking the hasCreatedEvent dedup guard.
  // The cursor is stable for retries of the same resumption (idempotent
  // within a single resume) but advances across resumes — exactly the
  // determinism boundary we want.
  const seedParts = [
    workflowRun.runId,
    workflowRun.workflowName,
    String(startedAt),
  ];
  if (existingSnapshot?.metadata.eventsCursor) {
    seedParts.push(existingSnapshot.metadata.eventsCursor);
  }
  const seed = seedParts.join(':');
  const rng = seedrandom(seed);

  let vm: QuickJS;

  // Seeded nanoid generator — uses the same nanoid package and seeded PRNG
  // as the event-replay runtime for consistent token generation.
  const generateNanoid = nanoid.customRandom(nanoid.urlAlphabet, 21, (size) =>
    new Uint8Array(size).map(() => 256 * rng())
  );

  if (existingSnapshot) {
    // ---- RESTORE from snapshot ----
    const deserializeStart = performance.now();
    const snapshot = QuickJS.deserializeSnapshot(existingSnapshot.data);
    const deserializeDurationMs = Math.round(
      performance.now() - deserializeStart
    );
    options.parentSpan?.setAttributes({
      ...Attribute.SnapshotDeserializeDurationMs(deserializeDurationMs),
    });
    vm = await QuickJS.restore(snapshot, {
      wasm: quickjsWasm,
      // Use real time for Date.now() — determinism is handled by seeded Math.random
      memoryLimit: 256 * 1024 * 1024,
      interruptHandler: createInterruptHandler(),
      extensions: quickjsExtensions,
    });

    // Re-register host callbacks after restore. Host functions are stored
    // in the WASM heap by name. After restore, the host callback registry
    // is empty — we must re-register each callback with the same name
    // used during newFunction() in the first-run path.
    vm.registerHostCallback('random', () => vm.newNumber(rng()));
    vm.registerHostCallback('__generateNanoid', () =>
      vm.newString(generateNanoid())
    );

    // Note: __wdk_serialize/__wdk_deserialize are JS functions in the VM
    // (set by the serde bundle), so they survive snapshot/restore as part
    // of the QuickJS heap. No re-registration needed.

    // Process events and drain jobs in a loop. Events may resolve promises
    // that unblock workflow code, which then creates NEW resolvers for
    // subsequent events. Re-processing events matches these new resolvers
    // against events that were already delivered.
    let maxIterations = 100;
    let madeProgress: boolean;
    do {
      madeProgress = await processEvents(vm, events, options.encryptionKey);
      let batch: number;
      do {
        batch = vm.executePendingJobs();
        if (batch > 0) madeProgress = true;
      } while (batch > 0);
    } while (madeProgress && --maxIterations > 0);
  } else {
    // ---- FIRST RUN ----
    vm = await QuickJS.create({
      wasm: quickjsWasm,
      // Use real time for Date.now() — determinism is handled by seeded Math.random
      memoryLimit: 256 * 1024 * 1024,
      interruptHandler: createInterruptHandler(),
      extensions: quickjsExtensions,
    });

    // Seeded Math.random — host callback ID = baseId
    {
      using randomFn = vm.newFunction('random', () => vm.newNumber(rng()));
      using math = vm.global.getProp('Math');
      math.setProp('random', randomFn);
    }

    // Seeded nanoid generator — host callback ID = baseId + 1
    {
      using nanoidFn = vm.newFunction('__generateNanoid', () =>
        vm.newString(generateNanoid())
      );
      vm.setProp(vm.global, '__generateNanoid', nanoidFn);
    }

    // Evaluate the VM serde bundle
    vm.evalCode(VM_SERDE_BUNDLE, 'vm-serde.js').dispose();

    // Bootstrap workflow primitives
    vm.evalCode(VM_BOOTSTRAP, 'bootstrap.js').dispose();

    // Execute the workflow bundle — use the workflowId as the eval filename
    // so QuickJS stack traces reference the workflow name, enabling source map
    // remapping by remapErrorStack (which matches frames by filename).
    try {
      vm.evalCode(workflowCode, workflowId || 'workflow.js').dispose();
    } catch (err) {
      return extractError(vm, err, 'Workflow evaluation failed');
    }

    // Extract workflow arguments. Prefer the run_created event; fall back
    // to the queue message's runInput if the event log is incomplete
    // (eventually-consistent read after start()). Failing to find input
    // for a first invocation is fatal — running the workflow function
    // with no args would silently turn typed arguments into `undefined`
    // and, for recursive workflows, produce exponential fan-out.
    const runCreatedEvent = events.find((e) => e.eventType === 'run_created');
    const runCreatedInput =
      runCreatedEvent && 'eventData' in runCreatedEvent
        ? (runCreatedEvent.eventData as Record<string, unknown>)?.input
        : undefined;
    const runInput: unknown =
      runCreatedInput ?? (options.runInput?.input as unknown);

    if (runInput instanceof Uint8Array) {
      const decryptedInput = (await decryptData(
        runInput,
        options.encryptionKey
      )) as Uint8Array;
      runtimeLogger.debug('Snapshot runtime: run input format', {
        prefix: new TextDecoder().decode(decryptedInput.subarray(0, 4)),
        byteLength: decryptedInput.byteLength,
        source: runCreatedInput ? 'run_created' : 'queueMessage.runInput',
      });
      const inputHandle = vm.newUint8Array(decryptedInput);
      vm.setProp(vm.global, '__wdk_input', inputHandle);
      inputHandle.dispose();
    } else if (runInput === undefined && events.length > 0) {
      // The event log is non-empty (we got run_started or similar) but
      // no run_created event was found and no queue-provided runInput is
      // available. This is the race condition observed during the fib
      // incident — silently dropping arguments would turn `n` into
      // `undefined` and, for recursive workflows, cause exponential
      // fan-out. Fail loud so the run goes to `run_failed` and the queue
      // can retry. Empty `events` is allowed because tests that bootstrap
      // a workflow with no arguments rely on the old permissive behavior.
      throw new Error(
        `Cannot start workflow run "${workflowRun.runId}": no run_created event found and no runInput in the queue payload, but other events are present (likely a read-after-write race during start()).`
      );
    }

    // Set workflow context metadata (for getWorkflowMetadata()).
    // Must match the shape that the replay runtime produces (see
    // packages/core/src/workflow.ts: runWorkflow → ctx) so user code
    // that compares `getWorkflowMetadata()` values between a step
    // (server-side) and the workflow (VM-side) sees identical objects.
    {
      const metadata = {
        workflowName: workflowRun.workflowName,
        workflowRunId: workflowRun.runId,
        workflowStartedAt: workflowRun.startedAt
          ? new Date(+workflowRun.startedAt)
          : new Date(),
        url: process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : `http://localhost:${options.port ?? 3000}`,
        features: { encryption: !!options.encryptionKey },
      };
      vm.evalCode(
        `globalThis[Symbol.for("WORKFLOW_CONTEXT")] = ${JSON.stringify(metadata)};` +
          `globalThis[Symbol.for("WORKFLOW_CONTEXT")].workflowStartedAt = new Date(${JSON.stringify(metadata.workflowStartedAt.toISOString())});`
      ).dispose();
    }

    // Start the workflow function. If the workflow isn't registered,
    // throw an error tagged with `name = "WorkflowNotRegisteredError"`
    // so the host-side entrypoint can reconstruct a real
    // WorkflowNotRegisteredError (a WorkflowRuntimeError subclass that
    // classifies as RUNTIME_ERROR) rather than a generic user error.
    // See snapshot-entrypoint.ts's run_failed branch.
    try {
      vm.evalCode(`
        var __wfn = globalThis.__private_workflows.get(${JSON.stringify(workflowId)});
        if (!__wfn) {
          var __wfnErr = new Error("Workflow \\"" + ${JSON.stringify(workflowId)} + "\\" is not registered in the current deployment.");
          __wfnErr.name = "WorkflowNotRegisteredError";
          throw __wfnErr;
        }
        var __args = globalThis.__wdk_input
          ? globalThis.__wdk_deserialize(globalThis.__wdk_input)
          : [];
        delete globalThis.__wdk_input;
        if (!Array.isArray(__args)) __args = [__args];
        __wfn.apply(null, __args).then(
          function(result) { globalThis.__workflowResult = globalThis.__wdk_serialize(result); },
          function(error) {
            globalThis.__workflowError = {
              message: error.message || String(error),
              stack: error.stack || "",
              name: error.name || "Error"
            };
          }
        );
      `).dispose();
    } catch (err) {
      return extractError(vm, err, 'Failed to start workflow');
    }

    // Process events and drain jobs in a loop (same as restore path)
    {
      let maxIterations = 100;
      let madeProgress: boolean;
      do {
        madeProgress = await processEvents(vm, events, options.encryptionKey);
        let batch: number;
        do {
          batch = vm.executePendingJobs();
          if (batch > 0) madeProgress = true;
        } while (batch > 0);
      } while (madeProgress && --maxIterations > 0);
    }
  }

  // ---- Check result ----
  return checkWorkflowState(vm, options.parentSpan);
}

// ---- Event Processing ----

async function processEvents(
  vm: QuickJS,
  events: Event[],
  encryptionKey?: CryptoKey
): Promise<boolean> {
  let resolved = false;
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
          vm.evalCode(`!!globalThis.__resolvers["${escapedCid}"]`)
        );
        const rawOutput = eventData?.result ?? eventData?.output;
        if (hasResolver) {
          if (rawOutput instanceof Uint8Array) {
            // Decrypt if encrypted — the VM only understands 'devl' format
            runtimeLogger.debug('Snapshot runtime: step result raw', {
              correlationId: escapedCid,
              rawPrefix: new TextDecoder().decode(rawOutput.subarray(0, 4)),
              rawByteLength: rawOutput.byteLength,
              isBuffer: Buffer.isBuffer(rawOutput),
            });
            const decryptedOutput = (await decryptData(
              rawOutput,
              encryptionKey
            )) as Uint8Array;
            runtimeLogger.debug('Snapshot runtime: step result decrypted', {
              correlationId: escapedCid,
              prefix: new TextDecoder().decode(decryptedOutput.subarray(0, 4)),
              byteLength: decryptedOutput.byteLength,
            });
            const bytesHandle = vm.newUint8Array(decryptedOutput);
            vm.setProp(vm.global, '__tmp_result', bytesHandle);
            bytesHandle.dispose();
            vm.evalCode(
              `globalThis.__resolvers["${escapedCid}"].resolve(globalThis.__wdk_deserialize(globalThis.__tmp_result));` +
                `delete globalThis.__resolvers["${escapedCid}"];` +
                `delete globalThis.__tmp_result;`
            ).dispose();
          } else {
            runtimeLogger.debug('Snapshot runtime: step result non-binary', {
              correlationId: escapedCid,
              type: typeof rawOutput,
              isNull: rawOutput === null,
              isUndefined: rawOutput === undefined,
              constructor: rawOutput?.constructor?.name,
            });
            const serialized =
              rawOutput !== undefined ? JSON.stringify(rawOutput) : 'undefined';
            vm.evalCode(
              `globalThis.__resolvers["${escapedCid}"].resolve(${serialized});` +
                `delete globalThis.__resolvers["${escapedCid}"];`
            ).dispose();
          }
          // Drain ALL microtasks after resolve
          {
            resolved = true;
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
          vm.evalCode(`!!globalThis.__resolvers["${escapedCid}"]`)
        );
        if (hasResolver) {
          const errorData = eventData?.error;
          const isErrorObject =
            typeof errorData === 'object' && errorData !== null;
          const msg = isErrorObject
            ? (((errorData as Record<string, unknown>).message as string) ??
              'Step failed')
            : typeof errorData === 'string'
              ? errorData
              : 'Step failed';
          // Extract the error stack from the event (set by the step handler)
          const errorStack =
            (isErrorObject
              ? (errorData as Record<string, unknown>).stack
              : undefined) ?? (eventData?.stack as string | undefined);
          // Create a FatalError (matching event-replay behavior where all
          // step_failed events produce FatalError instances, enabling
          // FatalError.is() detection in workflow catch blocks).
          const stackAssignment = errorStack
            ? `e.stack=${JSON.stringify(errorStack)};`
            : '';
          vm.evalCode(
            `(function(){var e=new Error(${JSON.stringify(msg)});e.name="FatalError";e.fatal=true;${stackAssignment}` +
              `globalThis.__resolvers["${escapedCid}"].reject(e);` +
              `delete globalThis.__resolvers["${escapedCid}"];})()`
          ).dispose();
          {
            resolved = true;
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
          vm.evalCode(`!!globalThis.__resolvers["${escapedCid}"]`)
        );
        if (hasResolver) {
          vm.evalCode(
            `globalThis.__resolvers["${escapedCid}"].resolve();` +
              `delete globalThis.__resolvers["${escapedCid}"];`
          ).dispose();
          {
            resolved = true;
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
        // Check if this event was already processed (delivered or buffered)
        // in this invocation or a prior one (tracked in the VM heap so it
        // survives snapshot/restore). Prevents double-delivery when the
        // outer loop re-scans events.
        const alreadyProcessed = event.eventId
          ? vm.dump(
              vm.evalCode(
                `!!(globalThis.__hookPayloadBuffer.__processedEventIds && globalThis.__hookPayloadBuffer.__processedEventIds[${JSON.stringify(event.eventId)}])`
              )
            )
          : false;
        if (alreadyProcessed) {
          runtimeLogger.debug(
            'Snapshot runtime: hook_received already processed',
            {
              correlationId: cid,
              eventId: event.eventId,
            }
          );
          markCreated(vm, escapedCid);
          break;
        }
        const hasResolver = vm.dump(
          vm.evalCode(`!!globalThis.__resolvers["${escapedCid}"]`)
        );
        const rawPayload = eventData?.payload ?? eventData?.result;
        runtimeLogger.debug('Snapshot runtime: processing hook_received', {
          correlationId: cid,
          eventId: event.eventId,
          hasResolver,
          payloadType: typeof rawPayload,
          payloadIsUint8Array: rawPayload instanceof Uint8Array,
          payloadKeys:
            rawPayload && typeof rawPayload === 'object'
              ? Object.keys(rawPayload)
              : undefined,
        });
        if (hasResolver) {
          if (rawPayload instanceof Uint8Array) {
            // Decrypt if encrypted — the VM only understands 'devl' format
            const decryptedPayload = (await decryptData(
              rawPayload,
              encryptionKey
            )) as Uint8Array;
            const bytesHandle = vm.newUint8Array(decryptedPayload);
            vm.setProp(vm.global, '__tmp_result', bytesHandle);
            bytesHandle.dispose();
            vm.evalCode(
              `globalThis.__resolvers["${escapedCid}"].resolve(globalThis.__wdk_deserialize(globalThis.__tmp_result));` +
                `delete globalThis.__resolvers["${escapedCid}"];` +
                `delete globalThis.__tmp_result;`
            ).dispose();
          } else {
            const serialized =
              rawPayload !== undefined
                ? JSON.stringify(rawPayload)
                : 'undefined';
            vm.evalCode(
              `globalThis.__resolvers["${escapedCid}"].resolve(${serialized});` +
                `delete globalThis.__resolvers["${escapedCid}"];`
            ).dispose();
          }
          // Mark this event as processed in the VM heap to prevent
          // double-delivery on re-scan or snapshot restore.
          if (event.eventId) {
            vm.evalCode(
              `(globalThis.__hookPayloadBuffer.__processedEventIds = globalThis.__hookPayloadBuffer.__processedEventIds || {})[${JSON.stringify(event.eventId)}] = true;`
            ).dispose();
          }
          {
            resolved = true;
            let b: number;
            do {
              b = vm.executePendingJobs();
            } while (b > 0);
          }
        } else {
          // No resolver yet — buffer the payload in the VM heap so it
          // survives snapshot/restore. When createHookPromise() is called
          // later, it will drain this buffer first (matching the event-
          // replay runtime's payloadsQueue behavior).
          const eventIdJs = event.eventId
            ? JSON.stringify(event.eventId)
            : 'null';
          const bufferAndTrack =
            `(globalThis.__hookPayloadBuffer["${escapedCid}"] = globalThis.__hookPayloadBuffer["${escapedCid}"] || [])` +
            `.push(%PAYLOAD%);` +
            (event.eventId
              ? `(globalThis.__hookPayloadBuffer.__processedEventIds = globalThis.__hookPayloadBuffer.__processedEventIds || {})[${eventIdJs}] = true;`
              : '');
          if (rawPayload instanceof Uint8Array) {
            // Decrypt if encrypted — the VM only understands 'devl' format
            const decryptedPayload = (await decryptData(
              rawPayload,
              encryptionKey
            )) as Uint8Array;
            const bytesHandle = vm.newUint8Array(decryptedPayload);
            vm.setProp(vm.global, '__tmp_result', bytesHandle);
            bytesHandle.dispose();
            vm.evalCode(
              bufferAndTrack.replace(
                '%PAYLOAD%',
                'globalThis.__wdk_deserialize(globalThis.__tmp_result)'
              ) + 'delete globalThis.__tmp_result;'
            ).dispose();
          } else {
            const serialized =
              rawPayload !== undefined
                ? JSON.stringify(rawPayload)
                : 'undefined';
            vm.evalCode(
              bufferAndTrack.replace('%PAYLOAD%', serialized)
            ).dispose();
          }
        }
        markCreated(vm, escapedCid);
        break;
      }
      case 'hook_conflict': {
        const hasResolver = vm.dump(
          vm.evalCode(`!!globalThis.__resolvers["${escapedCid}"]`)
        );
        if (hasResolver) {
          const conflictToken = (eventData?.token as string) ?? 'unknown';
          vm.evalCode(
            `globalThis.__resolvers["${escapedCid}"].reject(new Error(${JSON.stringify(`Hook token "${conflictToken}" is already in use by another workflow`)}));` +
              `delete globalThis.__resolvers["${escapedCid}"];`
          ).dispose();
          {
            resolved = true;
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
      case 'hook_created': {
        markCreated(vm, escapedCid);
        break;
      }
      case 'hook_disposed': {
        // Disambiguate from the `hook` pending op with the same
        // correlationId — we want to mark the `hook_dispose` entry.
        markCreated(vm, escapedCid, 'hook_dispose');
        break;
      }
    }
  }
  return resolved;
}

function markCreated(vm: QuickJS, escapedCid: string, opType?: string): void {
  // `hook` and `hook_dispose` pending ops share the same correlationId,
  // so when processing `hook_disposed` events we must disambiguate by
  // type — otherwise `.find()` returns the original `hook` op and the
  // `hook_dispose` op is never marked, causing the entrypoint to keep
  // retrying a hook_disposed for an already-deleted entity.
  const predicate = opType
    ? `function(p){return p.correlationId==="${escapedCid}"&&p.type==="${opType}";}`
    : `function(p){return p.correlationId==="${escapedCid}";}`;
  vm.evalCode(
    `var __p=globalThis.__pending.find(${predicate});` +
      `if(__p)__p.hasCreatedEvent=true;`
  ).dispose();
}

// ---- State Checking ----

function checkWorkflowState(
  vm: QuickJS,
  parentSpan?: Span
): SnapshotRuntimeResult {
  // Check completed — __workflowResult is a format-prefixed Uint8Array
  {
    using h = vm.evalCode('globalThis.__workflowResult');
    if (!h.isUndefined) {
      const resultBytes = h.toUint8Array();
      vm.dispose();
      return { completed: { result: resultBytes } };
    }
  }

  // Check failed
  {
    using h = vm.evalCode('globalThis.__workflowError');
    if (!h.isUndefined) {
      const errorObj = vm.dump(h) as
        | { message: string; stack?: string; name?: string }
        | string;
      const failed =
        typeof errorObj === 'string'
          ? { message: errorObj }
          : {
              message: errorObj.message,
              stack: errorObj.stack || undefined,
              name: errorObj.name || undefined,
            };
      runtimeLogger.error('Snapshot runtime: workflow failed in VM', {
        errorMessage: failed.message,
        errorName: failed.name,
        errorStack: failed.stack,
      });
      vm.dispose();
      return { failed };
    }
  }

  // Check suspended — the workflow is suspended if there are active resolvers
  // OR pending operations that haven't been created yet (e.g. hooks created
  // upfront but not yet awaited)
  {
    using h = vm.evalCode(
      'Object.keys(globalThis.__resolvers).length > 0 || globalThis.__pending.some(function(p){return!p.hasCreatedEvent;})'
    );
    if (vm.dump(h)) {
      using pendingH = vm.evalCode(
        `globalThis.__pending.filter(function(p){return!!globalThis.__resolvers[p.correlationId] || !p.hasCreatedEvent;})`
      );
      const pendingOps = vm.dump(pendingH) as PendingOperation[];

      const serializeStart = performance.now();
      const snapshot = vm.snapshot();
      const serialized = QuickJS.serializeSnapshot(snapshot);
      const serializeDurationMs = Math.round(
        performance.now() - serializeStart
      );
      parentSpan?.setAttributes({
        ...Attribute.SnapshotSerializeDurationMs(serializeDurationMs),
      });
      vm.dispose();

      runtimeLogger.debug('Snapshot runtime: serialized snapshot', {
        type: typeof serialized,
        byteLength: serialized?.byteLength,
        length: serialized?.length,
        durationMs: serializeDurationMs,
      });

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
  err: unknown,
  fallbackMessage: string
): SnapshotRuntimeResult {
  let message = fallbackMessage;
  let stack: string | undefined;
  let name: string | undefined;

  if (err instanceof JSException) {
    const error = vm.dump(err.handle) as Record<string, unknown> | null;
    err.handle.dispose();
    message = (error?.message as string) ?? err.message ?? fallbackMessage;
    stack = (error?.stack as string) ?? err.stack;
    name = (error?.name as string) ?? err.name;
  } else if (err instanceof Error) {
    message = err.message ?? fallbackMessage;
    stack = err.stack;
    name = err.name;
  }

  vm.dispose();
  return {
    failed: { message, stack, name },
  };
}

function createInterruptHandler(): () => boolean {
  const start = Date.now();
  const timeout = 30_000;
  return () => Date.now() - start > timeout;
}
