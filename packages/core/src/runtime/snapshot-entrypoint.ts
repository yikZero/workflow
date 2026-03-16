/**
 * Snapshot runtime integration with the Workflow DevKit.
 *
 * This module provides the entry point for running workflows using the
 * snapshot-based runtime instead of the event-replay runtime.
 */

import { WorkflowAPIError } from '@workflow/errors';
import { parseWorkflowName } from '@workflow/utils/parse-name';
import {
  type Event,
  SPEC_VERSION_CURRENT,
  type WorkflowRun,
} from '@workflow/world';
import { runtimeLogger } from '../logger.js';
import { remapErrorStack } from '../source-map.js';
import { queueMessage } from './helpers.js';
import {
  type PendingHook,
  type PendingStep,
  type PendingWait,
  runSnapshotWorkflow,
} from './snapshot-runtime.js';
import { getWorld } from './world.js';

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
}): Promise<{ timeoutSeconds?: number } | void> {
  const { workflowCode, workflowName, workflowRun } = params;
  const world = getWorld();
  const runId = workflowRun.runId;

  // The workflowName from the queue topic is already the full workflow ID
  // (e.g. "workflow//./workflows/1_simple//simple")
  const workflowId = workflowName;

  // Check for existing snapshot
  const existingSnapshot = await world.snapshots.load(runId);

  // Fetch events — either all (first run) or since last snapshot (restore)
  let events: Event[];
  let lastEventsCursor: string | null =
    existingSnapshot?.metadata.eventsCursor ?? null;

  {
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

  runtimeLogger.info('Snapshot runtime: fetched events', {
    workflowRunId: runId,
    eventCount: events.length,
    isRestore: !!existingSnapshot,
    eventsCursor: lastEventsCursor,
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
          if (WorkflowAPIError.is(err) && err.status === 409) continue;
          throw err;
        }
      }
    }
  }

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
  });

  runtimeLogger.debug('Snapshot runtime: VM returned', {
    workflowRunId: runId,
    completed: !!result.completed,
    suspended: !!result.suspended,
    failed: !!result.failed,
    pendingOpsCount: result.suspended?.pendingOperations?.length,
  });

  if (result.completed) {
    // Workflow completed
    runtimeLogger.info('Snapshot runtime: workflow completed', {
      workflowRunId: runId,
    });

    // Delete the snapshot
    await world.snapshots.delete(runId);

    // Create run_completed event
    try {
      await world.events.create(runId, {
        eventType: 'run_completed',
        specVersion: SPEC_VERSION_CURRENT,
        eventData: {
          // result.result is already format-prefixed devalue bytes
          output: result.completed.result,
        },
      });
    } catch (err) {
      if (
        WorkflowAPIError.is(err) &&
        (err.status === 409 || err.status === 410)
      ) {
        runtimeLogger.warn(
          'Workflow already finished, skipping run_completed',
          { workflowRunId: runId }
        );
        return;
      }
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

    // Save the snapshot
    await world.snapshots.save(runId, snapshot, {
      eventsCursor: lastEventsCursor,
      createdAt: new Date(),
    });

    // Create events and queue steps for pending operations
    let minTimeoutSeconds: number | undefined;

    for (const op of pendingOperations) {
      if (op.type === 'step' && !op.hasCreatedEvent) {
        const step = op as PendingStep;

        // Create step_created event
        try {
          await world.events.create(runId, {
            eventType: 'step_created',
            specVersion: SPEC_VERSION_CURRENT,
            correlationId: step.correlationId,
            eventData: {
              stepName: step.stepId,
              // step.input is already format-prefixed devalue bytes
              input: step.input,
            },
          });
        } catch (err) {
          if (WorkflowAPIError.is(err) && err.status === 409) continue;
          throw err;
        }

        // Queue the step execution
        // The queue name is __wkf_step_<stepName>
        // The step handler expects: workflowName, workflowRunId, workflowStartedAt, stepId
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
      } else if (op.type === 'hook' && !op.hasCreatedEvent) {
        const hook = op as PendingHook;

        // Create hook_created event.
        // First check if our hook entity already exists (stale-snapshot race
        // where a concurrent invocation already created it). Skip entirely
        // to avoid creating spurious hook_conflict events.
        try {
          const { data: existingHooks } = await world.hooks.list({ runId });
          if (existingHooks.some((h) => h.hookId === hook.correlationId)) {
            continue;
          }
        } catch {
          // If hooks.list fails, proceed with creation attempt
        }

        try {
          const result = await world.events.create(runId, {
            eventType: 'hook_created',
            specVersion: SPEC_VERSION_CURRENT,
            correlationId: hook.correlationId,
            eventData: {
              token: hook.token,
              // metadata is already devalue-serialized (Uint8Array) from the VM
              metadata: hook.metadata,
              ...(hook.isWebhook ? { isWebhook: true } : {}),
            } as any,
          });

          // If the storage detected a real token conflict with another
          // workflow's hook, re-queue so the snapshot runtime can process
          // the conflict event and fail the workflow gracefully.
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
          if (WorkflowAPIError.is(err) && err.status === 409) continue;
          throw err;
        }
      } else if (op.type === 'hook_dispose' && !op.hasCreatedEvent) {
        // Create hook_disposed event
        try {
          await world.events.create(runId, {
            eventType: 'hook_disposed',
            specVersion: SPEC_VERSION_CURRENT,
            correlationId: op.correlationId,
          });
        } catch (err) {
          if (WorkflowAPIError.is(err) && err.status === 409) continue;
          throw err;
        }
      } else if (op.type === 'wait' && !op.hasCreatedEvent) {
        const wait = op as PendingWait;

        // Create wait_created event
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
          if (WorkflowAPIError.is(err) && err.status === 409) continue;
          throw err;
        }
      }
    }

    // Handle pending waits — both newly created and pre-existing from the
    // snapshot. For each wait, either create a wait_completed event (if
    // elapsed) or schedule a timeout for re-queuing.
    let needsRequeue = false;
    for (const op of pendingOperations) {
      if (op.type !== 'wait') continue;
      const wait = op as PendingWait;
      const resumeMs = new Date(wait.resumeAt).getTime() - Date.now();

      if (resumeMs <= 0) {
        // Wait has elapsed — create wait_completed and re-queue
        try {
          await world.events.create(runId, {
            eventType: 'wait_completed',
            specVersion: SPEC_VERSION_CURRENT,
            correlationId: wait.correlationId,
          });
          needsRequeue = true;
        } catch (err) {
          if (WorkflowAPIError.is(err) && err.status === 409) continue;
          throw err;
        }
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

    if (needsRequeue) {
      // An elapsed wait was completed — re-queue immediately so the
      // snapshot runtime can process the wait_completed event.
      return { timeoutSeconds: 0 };
    }

    if (minTimeoutSeconds !== undefined) {
      return { timeoutSeconds: minTimeoutSeconds };
    }
  } else if (result.failed) {
    // Workflow failed — remap stack trace using inline source maps
    let errorStack = result.failed.stack;
    if (errorStack) {
      const parsedName = parseWorkflowName(workflowName);
      const filename = parsedName?.moduleSpecifier || workflowName;
      errorStack = remapErrorStack(errorStack, filename, workflowCode);
    }

    runtimeLogger.error('Snapshot runtime: workflow failed', {
      workflowRunId: runId,
      errorName: result.failed.name,
      errorMessage: result.failed.message,
      errorStack,
    });

    // Delete the snapshot
    await world.snapshots.delete(runId);

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
        },
      });
    } catch (err) {
      if (
        WorkflowAPIError.is(err) &&
        (err.status === 409 || err.status === 410)
      ) {
        runtimeLogger.warn('Workflow already finished, skipping run_failed', {
          workflowRunId: runId,
        });
        return;
      }
      throw err;
    }
  }
}

// ---- Helpers ----
