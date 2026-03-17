import type { Span } from '@opentelemetry/api';
import { waitUntil } from '@vercel/functions';
import { WorkflowAPIError } from '@workflow/errors';
import {
  type CreateEventRequest,
  type SerializedData,
  SPEC_VERSION_CURRENT,
  type WorkflowRun,
  type World,
} from '@workflow/world';
import { importKey } from '../encryption.js';
import type {
  HookInvocationQueueItem,
  StepInvocationQueueItem,
  WaitInvocationQueueItem,
  WorkflowSuspension,
} from '../global.js';
import { runtimeLogger } from '../logger.js';
import { dehydrateStepArguments } from '../serialization.js';
import * as Attribute from '../telemetry/semantic-conventions.js';

export interface SuspensionHandlerParams {
  suspension: WorkflowSuspension;
  world: World;
  run: WorkflowRun;
  span?: Span;
  requestId?: string;
}

/**
 * Result of handling a suspension. Returns pending step items so the caller
 * can decide which to execute inline vs queue to background.
 */
export interface SuspensionHandlerResult {
  /** Pending step items with events created but NOT queued */
  pendingSteps: StepInvocationQueueItem[];
  /** Timeout from waits, if any */
  timeoutSeconds?: number;
  /** Whether a hook conflict was detected (should re-invoke immediately) */
  hasHookConflict: boolean;
}

/**
 * Handles a workflow suspension by processing all pending operations (hooks, steps, waits).
 * Creates events for all operations but does NOT queue step messages — returns the pending
 * steps so the caller can decide which to execute inline vs queue to background.
 *
 * Processing order:
 * 1. Hooks are processed first to prevent race conditions with webhook receivers
 * 2. Step events and wait events are created in parallel
 */
export async function handleSuspension({
  suspension,
  world,
  run,
  span,
  requestId,
}: SuspensionHandlerParams): Promise<SuspensionHandlerResult> {
  const runId = run.runId;
  // Separate queue items by type
  const stepItems = suspension.steps.filter(
    (item): item is StepInvocationQueueItem => item.type === 'step'
  );
  const allHookItems = suspension.steps.filter(
    (item): item is HookInvocationQueueItem => item.type === 'hook'
  );
  const waitItems = suspension.steps.filter(
    (item): item is WaitInvocationQueueItem => item.type === 'wait'
  );

  // Split hooks by what actions they need
  const hooksNeedingCreation = allHookItems.filter(
    (item) => !item.hasCreatedEvent
  );
  const hooksNeedingDisposal = allHookItems.filter((item) => item.disposed);

  // Resolve encryption key for this run
  const rawKey = await world.getEncryptionKeyForRun?.(run);
  const encryptionKey = rawKey ? await importKey(rawKey) : undefined;

  // Build and process hook_created events (same as V1)
  const hookEvents: CreateEventRequest[] = await Promise.all(
    hooksNeedingCreation.map(async (queueItem) => {
      const hookMetadata: SerializedData | undefined =
        typeof queueItem.metadata === 'undefined'
          ? undefined
          : ((await dehydrateStepArguments(
              queueItem.metadata,
              runId,
              encryptionKey,
              suspension.globalThis
            )) as SerializedData);
      return {
        eventType: 'hook_created' as const,
        specVersion: SPEC_VERSION_CURRENT,
        correlationId: queueItem.correlationId,
        eventData: {
          token: queueItem.token,
          metadata: hookMetadata,
          isWebhook: queueItem.isWebhook ?? false,
        },
      };
    })
  );

  let hasHookConflict = false;

  if (hookEvents.length > 0) {
    await Promise.all(
      hookEvents.map(async (hookEvent) => {
        try {
          const result = await world.events.create(runId, hookEvent, {
            requestId,
          });
          if (result.event!.eventType === 'hook_conflict') {
            hasHookConflict = true;
          }
        } catch (err) {
          if (WorkflowAPIError.is(err)) {
            if (err.status === 410) {
              runtimeLogger.info(
                'Workflow run already completed, skipping hook',
                { workflowRunId: runId, message: err.message }
              );
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      })
    );
  }

  // Process hook disposals (same as V1)
  if (hooksNeedingDisposal.length > 0) {
    await Promise.all(
      hooksNeedingDisposal.map(async (queueItem) => {
        const hookDisposedEvent: CreateEventRequest = {
          eventType: 'hook_disposed' as const,
          specVersion: SPEC_VERSION_CURRENT,
          correlationId: queueItem.correlationId,
        };
        try {
          await world.events.create(runId, hookDisposedEvent, { requestId });
        } catch (err) {
          if (WorkflowAPIError.is(err)) {
            if (err.status === 410) {
              runtimeLogger.info(
                'Workflow run already completed, skipping hook disposal',
                {
                  workflowRunId: runId,
                  correlationId: queueItem.correlationId,
                  message: err.message,
                }
              );
            } else if (err.status === 404) {
              runtimeLogger.info('Hook not found for disposal, continuing', {
                workflowRunId: runId,
                correlationId: queueItem.correlationId,
                message: err.message,
              });
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      })
    );
  }

  // Create step events (but do NOT queue step messages — V2 difference)
  const stepsNeedingCreation = new Set(
    stepItems
      .filter((queueItem) => !queueItem.hasCreatedEvent)
      .map((queueItem) => queueItem.correlationId)
  );

  const ops: Promise<void>[] = [];

  for (const queueItem of stepItems) {
    if (stepsNeedingCreation.has(queueItem.correlationId)) {
      ops.push(
        (async () => {
          const dehydratedInput = await dehydrateStepArguments(
            {
              args: queueItem.args,
              closureVars: queueItem.closureVars,
              thisVal: queueItem.thisVal,
            },
            runId,
            encryptionKey,
            suspension.globalThis
          );
          const stepEvent: CreateEventRequest = {
            eventType: 'step_created' as const,
            specVersion: SPEC_VERSION_CURRENT,
            correlationId: queueItem.correlationId,
            eventData: {
              stepName: queueItem.stepName,
              input: dehydratedInput as SerializedData,
            },
          };
          try {
            await world.events.create(runId, stepEvent, { requestId });
          } catch (err) {
            if (WorkflowAPIError.is(err) && err.status === 409) {
              runtimeLogger.info('Step already exists, continuing', {
                workflowRunId: runId,
                correlationId: queueItem.correlationId,
                message: err.message,
              });
            } else {
              throw err;
            }
          }
        })()
      );
    }
  }

  // Create wait events (same as V1)
  for (const queueItem of waitItems) {
    if (!queueItem.hasCreatedEvent) {
      ops.push(
        (async () => {
          const waitEvent: CreateEventRequest = {
            eventType: 'wait_created' as const,
            specVersion: SPEC_VERSION_CURRENT,
            correlationId: queueItem.correlationId,
            eventData: {
              resumeAt: queueItem.resumeAt,
            },
          };
          try {
            await world.events.create(runId, waitEvent, { requestId });
          } catch (err) {
            if (WorkflowAPIError.is(err) && err.status === 409) {
              runtimeLogger.info('Wait already exists, continuing', {
                workflowRunId: runId,
                correlationId: queueItem.correlationId,
                message: err.message,
              });
            } else {
              throw err;
            }
          }
        })()
      );
    }
  }

  waitUntil(
    Promise.all(ops).catch((opErr) => {
      const isAbortError =
        opErr?.name === 'AbortError' || opErr?.name === 'ResponseAborted';
      if (!isAbortError) throw opErr;
    })
  );
  await Promise.all(ops);

  // Calculate minimum timeout from waits
  const now = Date.now();
  const minTimeoutSeconds = waitItems.reduce<number | null>(
    (min, queueItem) => {
      const resumeAtMs = queueItem.resumeAt.getTime();
      const delayMs = Math.max(1000, resumeAtMs - now);
      const timeoutSeconds = Math.ceil(delayMs / 1000);
      if (min === null) return timeoutSeconds;
      return Math.min(min, timeoutSeconds);
    },
    null
  );

  span?.setAttributes({
    ...Attribute.WorkflowRunStatus('workflow_suspended'),
    ...Attribute.WorkflowStepsCreated(stepItems.length),
    ...Attribute.WorkflowHooksCreated(hooksNeedingCreation.length),
    ...Attribute.WorkflowWaitsCreated(waitItems.length),
  });

  return {
    pendingSteps: stepItems,
    timeoutSeconds: hasHookConflict ? 0 : (minTimeoutSeconds ?? undefined),
    hasHookConflict,
  };
}
