import { WorkflowAPIError, WorkflowRuntimeError } from '@workflow/errors';
import { parseWorkflowName } from '@workflow/utils/parse-name';
import {
  type Event,
  SPEC_VERSION_CURRENT,
  WorkflowInvokePayloadSchema,
  type WorkflowRun,
} from '@workflow/world';
import { importKey } from './encryption.js';
import { WorkflowSuspension } from './global.js';
import { runtimeLogger } from './logger.js';
import {
  getAllWorkflowRunEvents,
  getAllWorkflowRunEventsWithCursor,
  getNewWorkflowRunEvents,
  getQueueOverhead,
  getWorkflowQueueName,
  handleHealthCheckMessage,
  parseHealthCheckPayload,
  queueMessage,
  withHealthCheck,
} from './runtime/helpers.js';
import { executeStep } from './runtime/step-executor.js';
import { handleSuspension } from './runtime/suspension-handler.js';
import { getWorld, getWorldHandlers } from './runtime/world.js';
import { remapErrorStack } from './source-map.js';
import * as Attribute from './telemetry/semantic-conventions.js';
import {
  linkToCurrentContext,
  serializeTraceCarrier,
  trace,
  withTraceContext,
  withWorkflowBaggage,
} from './telemetry.js';
import { getErrorName, getErrorStack, normalizeUnknownError } from './types.js';
import { buildWorkflowSuspensionMessage } from './util.js';
import { runWorkflow } from './workflow.js';

export type { Event, WorkflowRun };
export { WorkflowSuspension } from './global.js';
export {
  type HealthCheckEndpoint,
  type HealthCheckOptions,
  type HealthCheckResult,
  healthCheck,
} from './runtime/helpers.js';
export {
  getHookByToken,
  resumeHook,
  resumeWebhook,
} from './runtime/resume-hook.js';
export {
  getRun,
  Run,
  type WorkflowReadableStreamOptions,
} from './runtime/run.js';
export {
  cancelRun,
  listStreams,
  type ReadStreamOptions,
  type RecreateRunOptions,
  readStream,
  recreateRunFromExisting,
  reenqueueRun,
  type StopSleepOptions,
  type StopSleepResult,
  wakeUpRun,
} from './runtime/runs.js';
export { type StartOptions, start } from './runtime/start.js';
export {
  createWorld,
  getWorld,
  getWorldHandlers,
  setWorld,
} from './runtime/world.js';

/**
 * Creates a single route which handles workflow execution requests,
 * executing steps inline when possible to reduce function invocations
 * and queue overhead.
 *
 * The handler loops: replay workflow → execute step inline → replay → ...
 * until the workflow completes, times out, or encounters non-step suspensions.
 *
 * @param workflowCode - The workflow bundle code containing all workflow functions
 * @returns A function that can be used as a Vercel API route
 */
export function workflowEntrypoint(
  workflowCode: string
): (req: Request) => Promise<Response> {
  // Configurable timeout: use env var or default to 110s (for 120s function limit)
  const NO_INLINE_REPLAY_AFTER_MS =
    Number(process.env.WORKFLOW_V2_TIMEOUT_MS) || 110_000;

  const handler = getWorldHandlers().createQueueHandler(
    '__wkf_workflow_',
    async (message_, metadata) => {
      const healthCheck = parseHealthCheckPayload(message_);
      if (healthCheck) {
        await handleHealthCheckMessage(healthCheck, 'workflow');
        return;
      }

      const {
        runId,
        traceCarrier: traceContext,
        requestedAt,
        stepId: incomingStepId,
      } = WorkflowInvokePayloadSchema.parse(message_);
      const workflowName = metadata.queueName.slice('__wkf_workflow_'.length);
      const spanLinks = await linkToCurrentContext();

      return await withTraceContext(traceContext, async () => {
        return await withWorkflowBaggage(
          { workflowRunId: runId, workflowName },
          async () => {
            const world = getWorld();
            return trace(
              `WORKFLOW_V2 ${workflowName}`,
              { links: spanLinks },
              async (span) => {
                span?.setAttributes({
                  ...Attribute.WorkflowName(workflowName),
                  ...Attribute.WorkflowOperation('execute_v2'),
                  ...Attribute.MessagingSystem('vercel-queue'),
                  ...Attribute.MessagingDestinationName(metadata.queueName),
                  ...Attribute.MessagingMessageId(metadata.messageId),
                  ...Attribute.MessagingOperationType('process'),
                  ...getQueueOverhead({ requestedAt }),
                  ...Attribute.WorkflowRunId(runId),
                  ...Attribute.WorkflowTracePropagated(!!traceContext),
                });

                const invocationStartTime = Date.now();
                let loopIteration = 0;

                // Event cache: keep loaded events in memory across loop iterations.
                // On the first iteration we do a full load; on subsequent iterations
                // we fetch only events created after the last known cursor.
                let cachedEvents: Event[] | null = null;
                let eventsCursor: string | null = null;

                // If incoming message has a stepId, this is a background step
                // execution. Execute the step, then queue a workflow continuation
                // (without stepId) so the workflow can replay and process the
                // step_completed event. Don't replay here — the step events
                // (step_started/step_completed) need to be processed by the
                // workflow's event consumer during replay.
                if (incomingStepId) {
                  const stepName = await getStepNameFromEvent(
                    world,
                    runId,
                    incomingStepId
                  );
                  if (stepName) {
                    const workflowRun = await world.runs.get(runId);
                    const workflowStartedAt = workflowRun.startedAt
                      ? +workflowRun.startedAt
                      : Date.now();
                    const stepResult = await executeStep({
                      world,
                      workflowRunId: runId,
                      workflowName,
                      workflowStartedAt,
                      stepId: incomingStepId,
                      stepName,
                    });
                    if (stepResult.type === 'retry') {
                      return { timeoutSeconds: stepResult.timeoutSeconds };
                    }
                    if (stepResult.type === 'throttled') {
                      return { timeoutSeconds: stepResult.timeoutSeconds };
                    }
                    // Step completed/failed/skipped/gone — queue workflow
                    // continuation so it can replay with the new events
                    if (
                      stepResult.type === 'completed' ||
                      stepResult.type === 'failed' ||
                      stepResult.type === 'skipped'
                    ) {
                      await queueMessage(
                        world,
                        getWorkflowQueueName(workflowName),
                        {
                          runId,
                          traceCarrier: await serializeTraceCarrier(),
                          requestedAt: new Date(),
                        }
                      );
                    }
                    return;
                  }
                  // stepName not found — fall through to replay
                  // (the workflow will handle the missing step)
                }

                // Main replay loop
                // biome-ignore lint/correctness/noConstantCondition: intentional loop
                while (true) {
                  loopIteration++;

                  // Check timeout before replay
                  if (
                    Date.now() - invocationStartTime >=
                    NO_INLINE_REPLAY_AFTER_MS
                  ) {
                    runtimeLogger.info(
                      'V2 timeout reached, re-scheduling workflow',
                      {
                        workflowRunId: runId,
                        loopIteration,
                        elapsedMs: Date.now() - invocationStartTime,
                      }
                    );
                    await queueMessage(
                      world,
                      getWorkflowQueueName(workflowName),
                      {
                        runId,
                        traceCarrier: await serializeTraceCarrier(),
                        requestedAt: new Date(),
                      }
                    );
                    return;
                  }

                  // Standard workflow replay
                  let workflowRun = await world.runs.get(runId);
                  let workflowStartedAt = -1;
                  let replayStart = 0;
                  try {
                    if (workflowRun.status === 'pending') {
                      const result = await world.events.create(runId, {
                        eventType: 'run_started',
                        specVersion: SPEC_VERSION_CURRENT,
                      });
                      if (!result.run) {
                        throw new WorkflowRuntimeError(
                          `Event creation for 'run_started' did not return the run entity for run "${runId}"`
                        );
                      }
                      workflowRun = result.run;
                    }

                    if (!workflowRun.startedAt) {
                      throw new WorkflowRuntimeError(
                        `Workflow run "${runId}" has no "startedAt" timestamp`
                      );
                    }
                    workflowStartedAt = +workflowRun.startedAt;

                    if (workflowRun.status !== 'running') {
                      runtimeLogger.info(
                        'Workflow already completed or failed, skipping',
                        { workflowRunId: runId, status: workflowRun.status }
                      );
                      return;
                    }

                    // Load events — use cached events with incremental fetch on subsequent iterations.
                    // The server always returns a cursor when there are events (even on the
                    // final page), so we can reliably use it for incremental loading.
                    let events: Event[];
                    if (cachedEvents === null) {
                      // First iteration: full load
                      const loaded =
                        await getAllWorkflowRunEventsWithCursor(runId);
                      events = loaded.events;
                      eventsCursor = loaded.cursor;
                    } else if (eventsCursor) {
                      // Subsequent iteration: fetch only new events since last cursor
                      const loaded = await getNewWorkflowRunEvents(
                        runId,
                        eventsCursor
                      );
                      cachedEvents.push(...loaded.events);
                      eventsCursor = loaded.cursor ?? eventsCursor;
                      events = cachedEvents;
                    } else {
                      // No cursor available despite having cached events. This should not
                      // happen — all World implementations return a cursor when there are
                      // events. If we hit this, the World has a bug. Fall back to a full
                      // reload to avoid stale data.
                      runtimeLogger.error(
                        'Event cursor missing after initial load — falling back to full reload. ' +
                          'This indicates a bug in the World implementation.',
                        { workflowRunId: runId }
                      );
                      const loaded =
                        await getAllWorkflowRunEventsWithCursor(runId);
                      cachedEvents = loaded.events;
                      eventsCursor = loaded.cursor;
                      events = cachedEvents;
                    }

                    // Complete elapsed waits
                    const now = Date.now();
                    const completedWaitIds = new Set(
                      events
                        .filter((e) => e.eventType === 'wait_completed')
                        .map((e) => e.correlationId)
                    );
                    const waitsToComplete = events
                      .filter(
                        (e): e is typeof e & { correlationId: string } =>
                          e.eventType === 'wait_created' &&
                          e.correlationId !== undefined &&
                          !completedWaitIds.has(e.correlationId) &&
                          now >= (e.eventData.resumeAt as Date).getTime()
                      )
                      .map((e) => ({
                        eventType: 'wait_completed' as const,
                        specVersion: SPEC_VERSION_CURRENT,
                        correlationId: e.correlationId,
                      }));

                    for (const waitEvent of waitsToComplete) {
                      try {
                        const result = await world.events.create(
                          runId,
                          waitEvent
                        );
                        events.push(result.event!);
                      } catch (err) {
                        if (WorkflowAPIError.is(err) && err.status === 409) {
                          continue;
                        }
                        throw err;
                      }
                    }

                    // Update cache reference (may have been set for first time)
                    cachedEvents = events;

                    // Replay workflow
                    const rawKey =
                      await world.getEncryptionKeyForRun?.(workflowRun);
                    const encryptionKey = rawKey
                      ? await importKey(rawKey)
                      : undefined;
                    runtimeLogger.debug('Starting workflow replay', {
                      workflowRunId: runId,
                      loopIteration,
                      eventCount: events.length,
                    });
                    replayStart = Date.now();
                    const result = await runWorkflow(
                      workflowCode,
                      workflowRun,
                      events,
                      encryptionKey
                    );
                    runtimeLogger.debug('Workflow replay completed', {
                      workflowRunId: runId,
                      loopIteration,
                      replayMs: Date.now() - replayStart,
                    });

                    // Workflow completed
                    try {
                      await world.events.create(runId, {
                        eventType: 'run_completed',
                        specVersion: SPEC_VERSION_CURRENT,
                        eventData: { output: result },
                      });
                    } catch (err) {
                      if (
                        WorkflowAPIError.is(err) &&
                        (err.status === 409 || err.status === 410)
                      ) {
                        runtimeLogger.warn(
                          'Tried completing workflow run, but run has already finished.',
                          { workflowRunId: runId, message: err.message }
                        );
                        return;
                      }
                      throw err;
                    }

                    span?.setAttributes({
                      ...Attribute.WorkflowRunStatus('completed'),
                    });
                    return;
                  } catch (err) {
                    if (WorkflowSuspension.is(err)) {
                      runtimeLogger.debug('Workflow suspended', {
                        workflowRunId: runId,
                        loopIteration,
                        replayMs: Date.now() - replayStart,
                        steps: err.stepCount,
                        hooks: err.hookCount,
                        waits: err.waitCount,
                      });
                      const suspensionMessage = buildWorkflowSuspensionMessage(
                        runId,
                        err.stepCount,
                        err.hookCount,
                        err.waitCount
                      );
                      if (suspensionMessage) {
                        runtimeLogger.debug(suspensionMessage);
                      }

                      // V2: handle suspension without queuing steps
                      const suspensionStart = Date.now();
                      const suspensionResult = await handleSuspension({
                        suspension: err,
                        world,
                        run: workflowRun,
                        span,
                      });
                      runtimeLogger.debug('Suspension handled', {
                        workflowRunId: runId,
                        suspensionMs: Date.now() - suspensionStart,
                        pendingSteps: suspensionResult.pendingSteps.length,
                        timeoutSeconds: suspensionResult.timeoutSeconds,
                        hasHookConflict: suspensionResult.hasHookConflict,
                      });

                      // Hook conflict: break loop, re-invoke via queue
                      if (suspensionResult.hasHookConflict) {
                        return { timeoutSeconds: 0 };
                      }

                      const pendingSteps = suspensionResult.pendingSteps;

                      if (pendingSteps.length === 0) {
                        // No steps — only waits/hooks
                        if (suspensionResult.timeoutSeconds !== undefined) {
                          return {
                            timeoutSeconds: suspensionResult.timeoutSeconds,
                          };
                        }
                        return;
                      }

                      // Steps to execute!
                      // Pick one step to execute inline, queue the rest
                      const [inlineStep, ...backgroundSteps] = pendingSteps;

                      // Queue background steps back to __wkf_workflow_* with stepId
                      for (const bgStep of backgroundSteps) {
                        const traceCarrier = await serializeTraceCarrier();
                        await queueMessage(
                          world,
                          getWorkflowQueueName(workflowName),
                          {
                            runId,
                            stepId: bgStep.correlationId,
                            traceCarrier,
                            requestedAt: new Date(),
                          },
                          {
                            idempotencyKey: bgStep.correlationId,
                          }
                        );
                      }

                      // Execute inline step
                      const stepResult = await executeStep({
                        world,
                        workflowRunId: runId,
                        workflowName,
                        workflowStartedAt,
                        stepId: inlineStep.correlationId,
                        stepName: inlineStep.stepName,
                      });

                      if (stepResult.type === 'retry') {
                        // Step needs retry — queue self with stepId for retry
                        const traceCarrier = await serializeTraceCarrier();
                        await queueMessage(
                          world,
                          getWorkflowQueueName(workflowName),
                          {
                            runId,
                            stepId: inlineStep.correlationId,
                            traceCarrier,
                            requestedAt: new Date(),
                          },
                          {
                            delaySeconds: stepResult.timeoutSeconds,
                          }
                        );
                        // If there are also waits, return their timeout
                        if (suspensionResult.timeoutSeconds !== undefined) {
                          return {
                            timeoutSeconds: suspensionResult.timeoutSeconds,
                          };
                        }
                        return;
                      }

                      if (stepResult.type === 'throttled') {
                        return {
                          timeoutSeconds: stepResult.timeoutSeconds,
                        };
                      }

                      // Step completed or failed — loop back to replay
                      // (gone/skipped also loop back since the workflow
                      // will see the completed/failed event on replay)

                      // If the step had pending background ops (e.g., stream
                      // writes to S3), break the loop and return so waitUntil
                      // can flush them. This matches V1 behavior where each
                      // step ran in a separate function invocation. Without
                      // this, the inline loop continues and the stream data
                      // may not reach S3 before the test tries to read it.
                      if (
                        stepResult.type === 'completed' &&
                        stepResult.hasPendingOps
                      ) {
                        await queueMessage(
                          world,
                          getWorkflowQueueName(workflowName),
                          {
                            runId,
                            traceCarrier: await serializeTraceCarrier(),
                            requestedAt: new Date(),
                          }
                        );
                        return;
                      }

                      if (
                        suspensionResult.timeoutSeconds !== undefined &&
                        pendingSteps.length === 1
                      ) {
                        // Only 1 step and there's also waits/hooks,
                        // step is done, but we need the wait timeout
                        // Loop back to replay which will re-evaluate
                      }
                    } else {
                      // User code error from runWorkflow — create run_failed.
                      if (err instanceof Error) {
                        span?.recordException?.(err);
                      }

                      const normalizedError = await normalizeUnknownError(err);
                      const errorName =
                        normalizedError.name || getErrorName(err);
                      const errorMessage = normalizedError.message;
                      let errorStack =
                        normalizedError.stack || getErrorStack(err);

                      if (errorStack) {
                        const parsedName = parseWorkflowName(workflowName);
                        const filename =
                          parsedName?.moduleSpecifier || workflowName;
                        errorStack = remapErrorStack(
                          errorStack,
                          filename,
                          workflowCode
                        );
                      }

                      runtimeLogger.error('Error while running workflow', {
                        workflowRunId: runId,
                        errorName,
                        errorStack,
                      });

                      try {
                        await world.events.create(runId, {
                          eventType: 'run_failed',
                          specVersion: SPEC_VERSION_CURRENT,
                          eventData: {
                            error: {
                              message: errorMessage,
                              stack: errorStack,
                            },
                          },
                        });
                      } catch (failErr) {
                        if (
                          WorkflowAPIError.is(failErr) &&
                          (failErr.status === 409 || failErr.status === 410)
                        ) {
                          runtimeLogger.warn(
                            'Tried failing workflow run, but run has already finished.',
                            {
                              workflowRunId: runId,
                              message: failErr.message,
                            }
                          );
                          return;
                        }
                        throw failErr;
                      }

                      span?.setAttributes({
                        ...Attribute.WorkflowRunStatus('failed'),
                        ...Attribute.WorkflowErrorName(errorName),
                        ...Attribute.WorkflowErrorMessage(errorMessage),
                        ...Attribute.ErrorType(errorName),
                      });
                      return;
                    }
                  }
                } // End while loop
              }
            ); // End trace
          }
        ); // End withWorkflowBaggage
      }); // End withTraceContext
    }
  );

  return withHealthCheck(handler);
}

/**
 * Look up the step name from the step_created event in the event log.
 * This is needed when the combined handler receives a message with stepId
 * (from a background queue) and needs to know which step function to call.
 */
async function getStepNameFromEvent(
  _world: import('@workflow/world').World,
  runId: string,
  stepId: string
): Promise<string | undefined> {
  const events = await getAllWorkflowRunEvents(runId);
  const stepCreated = events.find(
    (e) => e.eventType === 'step_created' && e.correlationId === stepId
  );
  if (!stepCreated) return undefined;
  // The eventData shape varies by event type; step_created has stepName
  // Use 'in' check since the Event union doesn't narrow through .find()
  if ('eventData' in stepCreated && stepCreated.eventData) {
    return (stepCreated.eventData as { stepName?: string }).stepName;
  }
  return undefined;
}
