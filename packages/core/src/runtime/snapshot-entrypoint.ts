/**
 * Snapshot runtime integration with the Workflow DevKit.
 *
 * This module provides the entry point for running workflows using the
 * snapshot-based runtime instead of the event-replay runtime.
 */

import type { Span } from '@opentelemetry/api';
import {
  EntityConflictError,
  RunExpiredError,
  WorkflowNotRegisteredError,
} from '@workflow/errors';
import { getPort } from '@workflow/utils/get-port';
import { parseWorkflowName } from '@workflow/utils/parse-name';
import {
  type Event,
  type RunInput,
  SPEC_VERSION_CURRENT,
  type WorkflowRun,
} from '@workflow/world';
import { classifyRunError } from '../classify-error.js';
import { importKey } from '../encryption.js';
import { runtimeLogger } from '../logger.js';
import {
  decrypt as decryptSerializedData,
  encrypt as encryptSerializedData,
} from '../serialization/encryption.js';
import { remapErrorStack } from '../source-map.js';
import * as Attribute from '../telemetry/semantic-conventions.js';
import { trace } from '../telemetry.js';
import { queueMessage } from './helpers.js';
import {
  type PendingHook,
  type PendingStep,
  type PendingWait,
  runSnapshotWorkflow,
} from './snapshot-runtime.js';
import { getWorld } from './world.js';

/** Tiny ms timer using performance.now() — already monotonic on Node. */
function tick(): number {
  return performance.now();
}

/**
 * Returns true when the supplied events indicate the workflow handler
 * has not yet completed a suspension cycle for this run, meaning a
 * `snapshots.load` call would 404 and can be skipped entirely.
 *
 * The suspension handler always writes the snapshot BEFORE any
 * `step_created` / `hook_created` / `wait_created` events
 * (`await trace('snapshot.save', ...)` then `Promise.all(opsPromises)`
 * in this file). So the presence of any non-initial event implies a
 * save attempt has at least started, and we should still try to load
 * to potentially restore from it. The contrapositive: if we only see
 * `run_created` / `run_started`, the handler has never reached its
 * first suspension and no snapshot exists.
 *
 * Returns false when `preloadedEvents` is missing/empty so the caller
 * falls back to the normal load path (the world may simply not have
 * preloaded events for this invocation).
 *
 * Exported for unit testing.
 */
export function canSkipSnapshotLoad(
  preloadedEvents: readonly Event[] | undefined
): boolean {
  if (!Array.isArray(preloadedEvents) || preloadedEvents.length === 0) {
    return false;
  }
  return preloadedEvents.every(
    (e) => e.eventType === 'run_created' || e.eventType === 'run_started'
  );
}

/**
 * Run a workflow using the snapshot runtime.
 *
 * This replaces the event-replay path (runWorkflow + EventsConsumer) with:
 * 1. Check for existing snapshot
 * 2. If snapshot exists: restore + process delta events
 * 3. If no snapshot: first run with full event log
 * 4. On suspension: save snapshot + create events + queue steps
 * 5. On completion: create run_completed + delete snapshot
 * 6. On failure: create run_failed + delete snapshot
 */
export async function runWorkflowWithSnapshots(params: {
  workflowCode: string;
  workflowName: string;
  workflowRun: WorkflowRun;
  /**
   * Events returned inline by `events.create('run_started', ...)`. When
   * present, they are used as the initial event log instead of fetching
   * via `events.list`, matching the replay runtime's fast path. Crucially,
   * if the world backfilled a missing `run_created` via the resilient
   * start path, `preloadedEvents` contains it even when a fresh
   * `events.list` might not (eventual consistency).
   */
  preloadedEvents?: Event[];
  /**
   * Run input carried through the queue message on first delivery. Used
   * as a last-resort fallback for `run_created.eventData.input` when
   * the event log is incomplete.
   */
  runInput?: RunInput;
  /**
   * The parent OTel span (the outer `WORKFLOW {workflowName}` span from
   * `runtime.ts`). When supplied, snapshot lifecycle attributes are
   * attached to it for end-to-end visibility.
   */
  parentSpan?: Span;
}): Promise<{ timeoutSeconds?: number } | void> {
  const {
    workflowCode,
    workflowName,
    workflowRun,
    preloadedEvents,
    runInput,
    parentSpan,
  } = params;
  const world = await getWorld();
  const runId = workflowRun.runId;
  const invocationStart = tick();
  // Per-invocation diagnostic id so checkpoint logs can be correlated even
  // if the same runId is processed by overlapping invocations on different
  // function instances.
  const invocationId = `inv_${Math.random().toString(36).slice(2, 10)}`;

  // Single high-volume diagnostic helper: emits a single-line structured
  // record to stderr that survives Vercel function-log collection and is
  // grep-friendly by runId. Always-on (warn level) so it shows up in
  // production logs without DEBUG. Use sparingly — one record per
  // invocation checkpoint.
  const wfdiag = (checkpoint: string, fields: Record<string, unknown>) => {
    runtimeLogger.warn('SNAPSHOT_DIAG', {
      checkpoint,
      runId,
      invocationId,
      tElapsedMs: Math.round(tick() - invocationStart),
      ...fields,
    });
  };

  parentSpan?.setAttributes({
    ...Attribute.SnapshotRuntime('snapshot'),
  });

  wfdiag('enter', {
    workflowName,
    hasPreloadedEvents:
      Array.isArray(preloadedEvents) && preloadedEvents.length > 0,
    preloadedEventCount: preloadedEvents?.length ?? 0,
    hasRunInput: !!runInput,
  });

  // The workflowName from the queue topic is already the full workflow ID
  // (e.g. "workflow//./workflows/1_simple//simple")
  const workflowId = workflowName;

  // Resolve the encryption key up front. Needed before loading the
  // snapshot (to decrypt it) and before saving (to encrypt it).
  const rawKey = await world.getEncryptionKeyForRun?.(workflowRun);
  const encryptionKey = rawKey ? await importKey(rawKey) : undefined;

  // Fast path: if the events we already have indicate the workflow
  // handler has not yet completed a suspension cycle for this run,
  // skip the `snapshots.load` round-trip (which would 404 anyway).
  const isFirstInvocation = canSkipSnapshotLoad(preloadedEvents);

  // Load + decrypt is wrapped in a child span so operators can see
  // snapshot-restore latency in waterfall views.
  const existingSnapshot = isFirstInvocation
    ? null
    : await trace<{
        data: Uint8Array;
        metadata: import('@workflow/world').SnapshotMetadata;
      } | null>('snapshot.load', async (loadSpan) => {
        const t0 = tick();
        const loadedSnapshot = await world.snapshots.load(runId);
        const loadDurationMs = tick() - t0;

        loadSpan?.setAttributes({
          ...Attribute.SnapshotLoadDurationMs(Math.round(loadDurationMs)),
        });
        parentSpan?.setAttributes({
          ...Attribute.SnapshotLoadDurationMs(Math.round(loadDurationMs)),
        });

        if (!loadedSnapshot) return null;

        loadSpan?.setAttributes({
          ...Attribute.SnapshotLoadBytes(loadedSnapshot.data.byteLength),
        });
        parentSpan?.setAttributes({
          ...Attribute.SnapshotLoadBytes(loadedSnapshot.data.byteLength),
        });

        // Decrypt if the snapshot was written with encryption. Plaintext
        // snapshots (written before this change, or on runs without
        // encryption configured) pass through unchanged.
        const decryptStart = tick();
        const decrypted = (await decryptSerializedData(
          loadedSnapshot.data,
          encryptionKey
        )) as Uint8Array;
        if (encryptionKey) {
          const decryptDurationMs = tick() - decryptStart;
          loadSpan?.setAttributes({
            ...Attribute.SnapshotDecryptDurationMs(
              Math.round(decryptDurationMs)
            ),
          });
          parentSpan?.setAttributes({
            ...Attribute.SnapshotDecryptDurationMs(
              Math.round(decryptDurationMs)
            ),
          });
        }

        return { data: decrypted, metadata: loadedSnapshot.metadata };
      });

  parentSpan?.setAttributes({
    ...Attribute.SnapshotInvocationKind(existingSnapshot ? 'restore' : 'first'),
  });

  wfdiag('snapshot_loaded', {
    invocationKind: existingSnapshot ? 'restore' : 'first',
    snapshotBytes: existingSnapshot?.data.byteLength ?? 0,
    eventsCursor: existingSnapshot?.metadata.eventsCursor ?? null,
    // True when we skipped the snapshots.load call entirely because
    // preloadedEvents indicated this is the first handler invocation.
    skippedLoad: isFirstInvocation,
  });

  // On first invocation (no snapshot), prefer preloadedEvents from the
  // run_started response — they're guaranteed to include run_created
  // even if the world's event log is eventually consistent. On restore,
  // we always fetch delta events via the cursor.
  let events: Event[];
  let lastEventsCursor: string | null =
    existingSnapshot?.metadata.eventsCursor ?? null;

  let eventsFetchedPages = 0;
  if (!existingSnapshot && preloadedEvents && preloadedEvents.length > 0) {
    events = preloadedEvents;
  } else {
    const allEvents: Event[] = [];
    let cursor: string | null = lastEventsCursor;
    let hasMore = true;

    while (hasMore) {
      const response = await world.events.list({
        runId,
        pagination: {
          sortOrder: 'asc',
          cursor: cursor ?? undefined,
          limit: 1000,
        },
      });
      eventsFetchedPages++;
      allEvents.push(...response.data);
      // Update the cursor to the last successfully fetched page's cursor.
      // Only update when we got results — the final empty-page response
      // returns cursor=null which we must NOT use (it would reset the cursor).
      if (response.cursor) {
        cursor = response.cursor;
      }
      hasMore = response.data.length > 0 && response.cursor != null;
    }

    events = allEvents;
    // Capture the final cursor position (after all fetched events)
    if (cursor) lastEventsCursor = cursor;
  }

  parentSpan?.setAttributes({
    ...Attribute.SnapshotEventsPreloaded(
      !existingSnapshot && !!preloadedEvents && preloadedEvents.length > 0
    ),
    ...Attribute.SnapshotEventsFetchedCount(events.length),
    ...Attribute.SnapshotEventsFetchedPages(eventsFetchedPages),
  });

  runtimeLogger.info('Snapshot runtime: fetched events', {
    workflowRunId: runId,
    eventCount: events.length,
    isRestore: !!existingSnapshot,
    eventsCursor: lastEventsCursor,
  });

  wfdiag('events_fetched', {
    eventCount: events.length,
    eventsFetchedPages,
    eventsCursor: lastEventsCursor,
    eventTypes: events.reduce<Record<string, number>>((acc, e) => {
      acc[e.eventType] = (acc[e.eventType] ?? 0) + 1;
      return acc;
    }, {}),
  });

  // Check for elapsed waits
  const now = Date.now();
  const completedWaitIds = new Set(
    events
      .filter((e) => e.eventType === 'wait_completed')
      .map((e) => e.correlationId)
  );
  for (const event of events) {
    if (
      event.eventType === 'wait_created' &&
      event.correlationId &&
      !completedWaitIds.has(event.correlationId)
    ) {
      const eventData =
        'eventData' in event
          ? (event.eventData as Record<string, unknown>)
          : undefined;
      const resumeAt = eventData?.resumeAt;
      if (resumeAt && now >= new Date(resumeAt as string).getTime()) {
        try {
          const result = await world.events.create(runId, {
            eventType: 'wait_completed',
            specVersion: SPEC_VERSION_CURRENT,
            correlationId: event.correlationId,
          });
          if (result.event) events.push(result.event);
        } catch (err) {
          if (EntityConflictError.is(err)) continue;
          throw err;
        }
      }
    }
  }

  // Resolve the workflow server port so `getWorkflowMetadata().url` inside
  // the VM matches what the step-side handler reports. Skipped on Vercel —
  // the VM reads VERCEL_URL directly in that environment.
  const isVercel = process.env.VERCEL_URL !== undefined;
  const port = isVercel ? undefined : await getPort();

  // Run the snapshot runtime
  runtimeLogger.debug('Snapshot runtime: invoking VM', {
    workflowRunId: runId,
    workflowId,
    eventCount: events.length,
    hasSnapshot: !!existingSnapshot,
  });

  const result = await runSnapshotWorkflow({
    workflowCode,
    workflowId,
    workflowRun,
    events,
    existingSnapshot,
    encryptionKey,
    port,
    runInput,
    parentSpan,
  });

  runtimeLogger.debug('Snapshot runtime: VM returned', {
    workflowRunId: runId,
    completed: !!result.completed,
    suspended: !!result.suspended,
    failed: !!result.failed,
    pendingOpsCount: result.suspended?.pendingOperations?.length,
  });

  wfdiag('vm_returned', {
    outcome: result.completed
      ? 'completed'
      : result.suspended
        ? 'suspended'
        : result.failed
          ? 'failed'
          : 'unknown',
    pendingOpsCount: result.suspended?.pendingOperations?.length ?? 0,
    pendingOpSummary: result.suspended?.pendingOperations?.map((p) => ({
      type: p.type,
      correlationId: p.correlationId,
      hasCreatedEvent: p.hasCreatedEvent,
      ...(p.type === 'step' ? { stepId: (p as PendingStep).stepId } : {}),
    })),
    failureMessage: result.failed?.message,
    failureName: result.failed?.name,
  });

  if (result.completed) {
    // Workflow completed
    runtimeLogger.info('Snapshot runtime: workflow completed', {
      workflowRunId: runId,
    });
    parentSpan?.setAttributes({
      ...Attribute.SnapshotOutcome('completed'),
    });

    // Delete the snapshot
    {
      const t0 = tick();
      await world.snapshots.delete(runId);
      parentSpan?.setAttributes({
        ...Attribute.SnapshotDeleteDurationMs(Math.round(tick() - t0)),
      });
    }

    // Create run_completed event.
    // The VM serializes the workflow result as format-prefixed devalue bytes
    // ("devl" + devalue) with no encryption (the VM has no access to the
    // CryptoKey). Host-side encryption is applied here so that `run_completed`
    // events have the same `encr`-prefixed payload shape that the replay
    // runtime's `dehydrateWorkflowReturnValue` produces.
    try {
      await world.events.create(runId, {
        eventType: 'run_completed',
        specVersion: SPEC_VERSION_CURRENT,
        eventData: {
          output: await encryptSerializedData(
            result.completed.result,
            encryptionKey
          ),
        },
      });
      wfdiag('exit_completed', { result: 'run_completed_written' });
    } catch (err) {
      if (EntityConflictError.is(err) || RunExpiredError.is(err)) {
        runtimeLogger.warn(
          'Workflow already finished, skipping run_completed',
          { workflowRunId: runId }
        );
        wfdiag('exit_completed', { result: 'already_finished' });
        return;
      }
      wfdiag('exit_completed_error', {
        errorName: (err as Error)?.name,
        errorMessage: (err as Error)?.message,
      });
      throw err;
    }
  } else if (result.suspended) {
    // Workflow suspended
    const { pendingOperations, snapshot } = result.suspended;

    runtimeLogger.info('Snapshot runtime: workflow suspended', {
      workflowRunId: runId,
      pendingSteps: pendingOperations.filter((p) => p.type === 'step').length,
      pendingWaits: pendingOperations.filter((p) => p.type === 'wait').length,
      pendingOps: pendingOperations.map((p) => ({
        type: p.type,
        correlationId: p.correlationId,
        hasCreatedEvent: p.hasCreatedEvent,
        ...(p.type === 'step'
          ? {
              stepId: (p as PendingStep).stepId,
              inputType: typeof (p as PendingStep).input,
              inputIsUint8Array: (p as PendingStep).input instanceof Uint8Array,
            }
          : {}),
      })),
    });

    parentSpan?.setAttributes({
      ...Attribute.SnapshotOutcome('suspended'),
      ...Attribute.SnapshotPendingOpsCount(pendingOperations.length),
      ...(lastEventsCursor
        ? Attribute.SnapshotEventsCursor(lastEventsCursor)
        : {}),
    });

    // Save the snapshot, encrypting if a key is available. The save
    // must complete before any step is queued so that subsequent
    // workflow invocations always observe a snapshot at-or-newer-than
    // the events they will process — pipelining save with queueMessage
    // creates a window where a step can complete and re-invoke the
    // workflow handler, which then loads a stale (or missing) snapshot
    // and replays a coroutine state that doesn't match the latest
    // events. Per-pending-op events.create + queueMessage calls below
    // ARE parallelized via Promise.all, which gives the bulk of the
    // wall-clock reduction without the ordering hazard. Wrapped in a
    // child span so operators can drill into serialize / encrypt /
    // persist latency separately.
    await trace('snapshot.save', async (saveSpan) => {
      const plaintextBytes = snapshot.byteLength;
      saveSpan?.setAttributes({
        ...Attribute.SnapshotSavePlaintextBytes(plaintextBytes),
      });
      parentSpan?.setAttributes({
        ...Attribute.SnapshotSavePlaintextBytes(plaintextBytes),
      });

      const encryptStart = tick();
      const snapshotToStore = (await encryptSerializedData(
        snapshot,
        encryptionKey
      )) as Uint8Array;
      if (encryptionKey) {
        const encryptDurationMs = Math.round(tick() - encryptStart);
        saveSpan?.setAttributes({
          ...Attribute.SnapshotEncryptDurationMs(encryptDurationMs),
        });
        parentSpan?.setAttributes({
          ...Attribute.SnapshotEncryptDurationMs(encryptDurationMs),
        });
      }

      runtimeLogger.debug('Snapshot runtime: saving snapshot', {
        workflowRunId: runId,
        snapshotType: typeof snapshotToStore,
        snapshotIsUint8Array: snapshotToStore instanceof Uint8Array,
        snapshotLength: snapshotToStore?.length,
        snapshotByteLength: snapshotToStore?.byteLength,
        encrypted: !!encryptionKey,
        eventsCursor: lastEventsCursor,
      });

      const saveStart = tick();
      await world.snapshots.save(runId, snapshotToStore, {
        eventsCursor: lastEventsCursor,
        createdAt: new Date(),
      });
      const saveDurationMs = Math.round(tick() - saveStart);

      saveSpan?.setAttributes({
        ...Attribute.SnapshotSaveBytes(snapshotToStore.byteLength),
        ...Attribute.SnapshotSaveDurationMs(saveDurationMs),
      });
      parentSpan?.setAttributes({
        ...Attribute.SnapshotSaveBytes(snapshotToStore.byteLength),
        ...Attribute.SnapshotSaveDurationMs(saveDurationMs),
      });
    });

    wfdiag('snapshot_saved', {
      plaintextBytes: snapshot.byteLength,
      eventsCursor: lastEventsCursor,
    });

    // Build per-pending-op promises so events.create + queueMessage
    // calls fan out in parallel rather than serially. This mirrors
    // the replay runtime's `Promise.all(ops)` pattern in
    // suspension-handler.ts and significantly reduces wall-clock time
    // on cloud worlds (e.g. Vercel) where each storage call is a
    // network round-trip.
    let minTimeoutSeconds: number | undefined;
    const opsPromises: Promise<void>[] = [];

    for (const op of pendingOperations) {
      if (op.type === 'step' && !op.hasCreatedEvent) {
        const step = op as PendingStep;
        opsPromises.push(
          (async () => {
            // Create step_created event. `step.input` is the format-prefixed
            // devalue bytes ("devl" + devalue) produced by
            // `__wdk_serialize({args, closureVars, thisVal})` inside the VM.
            // The VM has no access to the CryptoKey, so encryption is
            // applied here on the host side — matching what
            // `dehydrateStepArguments` does in the replay runtime.
            try {
              await world.events.create(runId, {
                eventType: 'step_created',
                specVersion: SPEC_VERSION_CURRENT,
                correlationId: step.correlationId,
                eventData: {
                  stepName: step.stepId,
                  input: await encryptSerializedData(step.input, encryptionKey),
                },
              });
            } catch (err) {
              if (EntityConflictError.is(err)) return;
              throw err;
            }

            // Queue the step execution. Queue name is __wkf_step_<stepName>;
            // step handler expects: workflowName, workflowRunId,
            // workflowStartedAt, stepId.
            const startedAtMs = workflowRun.startedAt
              ? +workflowRun.startedAt
              : Date.now();
            await queueMessage(
              world,
              `__wkf_step_${step.stepId}`,
              {
                workflowName: workflowRun.workflowName,
                workflowRunId: runId,
                workflowStartedAt: startedAtMs,
                stepId: step.correlationId,
                requestedAt: new Date(),
              },
              {
                idempotencyKey: step.correlationId,
              }
            );
            wfdiag('step_queued', {
              stepId: step.stepId,
              correlationId: step.correlationId,
            });
          })()
        );
      } else if (op.type === 'hook' && !op.hasCreatedEvent) {
        const hook = op as PendingHook;
        runtimeLogger.debug('Snapshot runtime: creating hook_created event', {
          workflowRunId: runId,
          correlationId: hook.correlationId,
          token: hook.token,
          tokenType: typeof hook.token,
          isWebhook: hook.isWebhook,
        });

        opsPromises.push(
          (async () => {
            // `hook.metadata` is the format-prefixed devalue bytes produced
            // by `__wdk_serialize(options.metadata)` inside the VM. Encrypt
            // on the host side before writing — matches the replay
            // runtime's `dehydrateStepArguments` flow.
            //
            // No pre-check via hooks.list: with deterministic correlationIds
            // (same VM seed across replays) and per-(runId, correlationId)
            // uniqueness in worlds, the storage layer rejects duplicates as
            // EntityConflictError, which we swallow below. This drops one
            // network round-trip per pending hook.
            try {
              const encryptedMetadata =
                typeof hook.metadata === 'undefined'
                  ? undefined
                  : await encryptSerializedData(hook.metadata, encryptionKey);
              const result = await world.events.create(runId, {
                eventType: 'hook_created',
                specVersion: SPEC_VERSION_CURRENT,
                correlationId: hook.correlationId,
                eventData: {
                  token: hook.token,
                  metadata: encryptedMetadata,
                  // Always include isWebhook explicitly. Worlds default it to
                  // `true` when absent, which would break the public webhook
                  // endpoint's 404 guard for hooks created via createHook().
                  isWebhook: hook.isWebhook,
                } as any,
              });

              // If storage detected a real token conflict with another
              // workflow's hook, re-queue so the snapshot runtime can
              // process the conflict event and fail gracefully.
              if (result.event?.eventType === 'hook_conflict') {
                await queueMessage(
                  world,
                  `__wkf_workflow_${workflowRun.workflowName}`,
                  {
                    runId,
                  },
                  { idempotencyKey: `hook_conflict_${hook.correlationId}` }
                );
              }
            } catch (err) {
              if (EntityConflictError.is(err)) return;
              throw err;
            }
          })()
        );
      } else if (op.type === 'hook_dispose' && !op.hasCreatedEvent) {
        opsPromises.push(
          (async () => {
            try {
              await world.events.create(runId, {
                eventType: 'hook_disposed',
                specVersion: SPEC_VERSION_CURRENT,
                correlationId: op.correlationId,
              });
            } catch (err) {
              if (EntityConflictError.is(err)) return;
              throw err;
            }
          })()
        );
      } else if (op.type === 'wait' && !op.hasCreatedEvent) {
        const wait = op as PendingWait;
        opsPromises.push(
          (async () => {
            try {
              await world.events.create(runId, {
                eventType: 'wait_created',
                specVersion: SPEC_VERSION_CURRENT,
                correlationId: wait.correlationId,
                eventData: {
                  resumeAt: new Date(wait.resumeAt),
                },
              });
            } catch (err) {
              if (EntityConflictError.is(err)) return;
              throw err;
            }
          })()
        );
      }
    }

    // Per-op dispatch runs in parallel; snapshot.save above already
    // completed.
    await Promise.all(opsPromises);

    // Handle pending waits — both newly created and pre-existing from the
    // snapshot. For each wait, either create a wait_completed event (if
    // elapsed) or schedule a timeout for re-queuing.
    let needsRequeue = false;
    const waitCompletePromises: Promise<void>[] = [];
    for (const op of pendingOperations) {
      if (op.type !== 'wait') continue;
      const wait = op as PendingWait;
      const resumeMs = new Date(wait.resumeAt).getTime() - Date.now();

      if (resumeMs <= 0) {
        // Wait has elapsed — create wait_completed and re-queue.
        waitCompletePromises.push(
          (async () => {
            try {
              await world.events.create(runId, {
                eventType: 'wait_completed',
                specVersion: SPEC_VERSION_CURRENT,
                correlationId: wait.correlationId,
              });
              needsRequeue = true;
            } catch (err) {
              if (EntityConflictError.is(err)) return;
              throw err;
            }
          })()
        );
      } else {
        // Wait hasn't elapsed yet — schedule a timeout
        const timeoutSeconds = Math.max(1, Math.ceil(resumeMs / 1000));
        if (
          minTimeoutSeconds === undefined ||
          timeoutSeconds < minTimeoutSeconds
        ) {
          minTimeoutSeconds = timeoutSeconds;
        }
      }
    }
    if (waitCompletePromises.length > 0) {
      await Promise.all(waitCompletePromises);
    }

    if (needsRequeue) {
      // An elapsed wait was completed — re-queue immediately so the
      // snapshot runtime can process the wait_completed event.
      wfdiag('exit_suspended', {
        action: 'wait_elapsed_requeue',
        timeoutSeconds: 0,
      });
      return { timeoutSeconds: 0 };
    }

    if (minTimeoutSeconds !== undefined) {
      wfdiag('exit_suspended', {
        action: 'schedule_wait_timeout',
        timeoutSeconds: minTimeoutSeconds,
      });
      return { timeoutSeconds: minTimeoutSeconds };
    }

    wfdiag('exit_suspended', {
      action: 'awaiting_external',
      pendingOpsCount: pendingOperations.length,
    });
  } else if (result.failed) {
    // Workflow failed — remap stack trace using inline source maps
    let errorStack = result.failed.stack;
    if (errorStack) {
      const parsedName = parseWorkflowName(workflowName);
      const filename = parsedName?.moduleSpecifier || workflowName;
      errorStack = remapErrorStack(errorStack, filename, workflowCode);
    }

    // Classify the error so consumers (`run.returnValue`, observability)
    // get `USER_ERROR` / `RUNTIME_ERROR` on `error.cause.code`, matching
    // what the replay runtime already does in runtime.ts.
    //
    // The VM serializes errors as `{ name, message, stack }`, so we
    // reconstruct a host-side Error of the correct class based on the
    // VM-side `name` — specific WorkflowRuntimeError subclasses need
    // to be preserved so classifyRunError() tags them as RUNTIME_ERROR.
    const reconstructed: Error =
      result.failed.name === 'WorkflowNotRegisteredError'
        ? new WorkflowNotRegisteredError(workflowName)
        : result.failed.name === 'Error'
          ? new Error(result.failed.message)
          : Object.assign(new Error(result.failed.message), {
              name: result.failed.name,
            });
    const errorCode = classifyRunError(reconstructed);

    runtimeLogger.error('Snapshot runtime: workflow failed', {
      workflowRunId: runId,
      errorName: result.failed.name,
      errorMessage: result.failed.message,
      errorStack,
      errorCode,
    });
    parentSpan?.setAttributes({
      ...Attribute.SnapshotOutcome('failed'),
    });

    // Delete the snapshot
    {
      const t0 = tick();
      await world.snapshots.delete(runId);
      parentSpan?.setAttributes({
        ...Attribute.SnapshotDeleteDurationMs(Math.round(tick() - t0)),
      });
    }

    // Create run_failed event
    try {
      await world.events.create(runId, {
        eventType: 'run_failed',
        specVersion: SPEC_VERSION_CURRENT,
        eventData: {
          error: {
            message: result.failed.message,
            stack: errorStack,
          },
          errorCode,
        },
      });
    } catch (err) {
      if (EntityConflictError.is(err) || RunExpiredError.is(err)) {
        runtimeLogger.warn('Workflow already finished, skipping run_failed', {
          workflowRunId: runId,
        });
        wfdiag('exit_failed', { result: 'already_finished' });
        return;
      }
      wfdiag('exit_failed_error', {
        errorName: (err as Error)?.name,
        errorMessage: (err as Error)?.message,
      });
      throw err;
    }
    wfdiag('exit_failed', { result: 'run_failed_written' });
  }
}

// ---- Helpers ----
