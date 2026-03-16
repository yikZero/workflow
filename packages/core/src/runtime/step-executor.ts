import { waitUntil } from '@vercel/functions';
import {
  FatalError,
  RetryableError,
  WorkflowAPIError,
  WorkflowRuntimeError,
} from '@workflow/errors';
import { pluralize } from '@workflow/utils';
import { getPort } from '@workflow/utils/get-port';
import type { World } from '@workflow/world';
import { SPEC_VERSION_CURRENT } from '@workflow/world';
import type { CryptoKey } from '../encryption.js';
import { importKey } from '../encryption.js';
import { runtimeLogger, stepLogger } from '../logger.js';
import { getStepFunction } from '../private.js';
import {
  dehydrateStepReturnValue,
  hydrateStepArguments,
} from '../serialization.js';
import { contextStorage } from '../step/context-storage.js';
import * as Attribute from '../telemetry/semantic-conventions.js';
import { trace } from '../telemetry.js';
import {
  getErrorName,
  getErrorStack,
  normalizeUnknownError,
} from '../types.js';

const DEFAULT_STEP_MAX_RETRIES = 3;

export interface StepExecutorParams {
  world: World;
  workflowRunId: string;
  workflowName: string;
  workflowStartedAt: number;
  stepId: string;
  stepName: string;
  encryptionKey?: CryptoKey;
}

/**
 * Result of a step execution attempt. The caller decides what to do
 * based on the result type (e.g., queue workflow continuation, replay inline, etc.).
 */
export type StepExecutionResult =
  | { type: 'completed'; hasPendingOps?: boolean }
  | { type: 'failed' }
  | { type: 'retry'; timeoutSeconds: number }
  | { type: 'skipped' }
  | { type: 'gone' }
  | { type: 'throttled'; timeoutSeconds: number };

/**
 * Executes a single step: creates step_started event, hydrates input,
 * runs the step function, creates step_completed/step_failed/step_retrying events.
 *
 * Does NOT queue workflow continuation messages — the caller decides what to do next.
 * Used by both the V1 step handler and the V2 combined handler.
 */
export async function executeStep(
  params: StepExecutorParams
): Promise<StepExecutionResult> {
  const {
    world,
    workflowRunId,
    workflowName,
    workflowStartedAt,
    stepId,
    stepName,
  } = params;
  const isVercel = process.env.VERCEL_URL !== undefined;

  return trace(`STEP ${stepName}`, {}, async (span) => {
    span?.setAttributes({
      ...Attribute.StepName(stepName),
      ...Attribute.WorkflowName(workflowName),
      ...Attribute.WorkflowRunId(workflowRunId),
      ...Attribute.StepId(stepId),
    });

    const stepFn = getStepFunction(stepName);
    if (!stepFn) {
      throw new Error(`Step "${stepName}" not found`);
    }
    if (typeof stepFn !== 'function') {
      throw new Error(
        `Step "${stepName}" is not a function (got ${typeof stepFn})`
      );
    }

    const maxRetries = stepFn.maxRetries ?? DEFAULT_STEP_MAX_RETRIES;

    span?.setAttributes({
      ...Attribute.StepMaxRetries(maxRetries),
    });

    // step_started validates state and returns the step entity
    let step;
    try {
      const startResult = await world.events.create(workflowRunId, {
        eventType: 'step_started',
        specVersion: SPEC_VERSION_CURRENT,
        correlationId: stepId,
      });

      if (!startResult.step) {
        throw new WorkflowRuntimeError(
          `step_started event for "${stepId}" did not return step entity`
        );
      }
      step = startResult.step;
    } catch (err) {
      if (WorkflowAPIError.is(err)) {
        if (err.status === 429) {
          const retryAfter = Math.max(
            1,
            typeof err.retryAfter === 'number' ? err.retryAfter : 1
          );
          runtimeLogger.info('Throttled on step_started, deferring', {
            retryAfterSeconds: retryAfter,
          });
          return { type: 'throttled', timeoutSeconds: retryAfter };
        }
        if (err.status === 410) {
          runtimeLogger.info(
            `Workflow run "${workflowRunId}" has already completed, skipping step "${stepId}": ${err.message}`
          );
          return { type: 'gone' };
        }
        if (err.status === 409) {
          runtimeLogger.debug('Step in terminal state, skipping', {
            stepName,
            stepId,
            workflowRunId,
            error: err.message,
          });
          span?.setAttributes({
            ...Attribute.StepSkipped(true),
            ...Attribute.StepSkipReason('completed'),
          });
          return { type: 'skipped' };
        }
        if (err.status === 425) {
          const retryAfterStr = (err as any).meta?.retryAfter;
          const retryAfter = retryAfterStr
            ? new Date(retryAfterStr)
            : new Date(Date.now() + 1000);
          const timeoutSeconds = Math.max(
            1,
            Math.ceil((retryAfter.getTime() - Date.now()) / 1000)
          );
          runtimeLogger.debug('Step retryAfter timestamp not yet reached', {
            stepName,
            stepId,
            retryAfter,
            timeoutSeconds,
          });
          return { type: 'retry', timeoutSeconds };
        }
      }
      throw err;
    }

    runtimeLogger.debug('Step execution details', {
      stepName,
      stepId: step.stepId,
      status: step.status,
      attempt: step.attempt,
    });

    span?.setAttributes({
      ...Attribute.StepStatus(step.status),
    });

    let result: unknown;

    // Check max retries AFTER step_started (attempt was just incremented).
    // Only enforce when the step has a previous error — this distinguishes
    // actual retries (failed → retry) from concurrent starts (V2 inline
    // execution loop can cause multiple handlers to step_started the same
    // step simultaneously, inflating the attempt counter without any failure).
    if (step.attempt > maxRetries + 1 && step.error) {
      const retryCount = step.attempt - 1;
      const errorMessage = `Step "${stepName}" exceeded max retries (${retryCount} ${pluralize('retry', 'retries', retryCount)})`;
      stepLogger.error('Step exceeded max retries', {
        workflowRunId,
        stepName,
        retryCount,
      });
      try {
        await world.events.create(workflowRunId, {
          eventType: 'step_failed',
          specVersion: SPEC_VERSION_CURRENT,
          correlationId: stepId,
          eventData: {
            error: errorMessage,
            stack: step.error?.stack,
          },
        });
      } catch (err) {
        if (WorkflowAPIError.is(err) && err.status === 409) {
          runtimeLogger.info(
            'Tried failing step, but step has already finished.',
            {
              workflowRunId,
              stepId,
              stepName,
              message: err.message,
            }
          );
          return { type: 'skipped' };
        }
        throw err;
      }
      span?.setAttributes({
        ...Attribute.StepStatus('failed'),
        ...Attribute.StepRetryExhausted(true),
      });
      return { type: 'failed' };
    }

    try {
      const attempt = step.attempt;

      if (!step.startedAt) {
        throw new WorkflowRuntimeError(
          `Step "${stepId}" has no "startedAt" timestamp`
        );
      }
      const stepStartedAt = step.startedAt;

      const ops: Promise<void>[] = [];
      // Use provided encryption key or resolve one
      let encryptionKey = params.encryptionKey;
      if (!encryptionKey) {
        const rawKey = await world.getEncryptionKeyForRun?.(workflowRunId);
        encryptionKey = rawKey ? await importKey(rawKey) : undefined;
      }
      const hydratedInput = await trace(
        'step.hydrate',
        {},
        async (hydrateSpan) => {
          const startTime = Date.now();
          const hydrated = await hydrateStepArguments(
            step.input,
            workflowRunId,
            encryptionKey,
            ops
          );
          const durationMs = Date.now() - startTime;
          hydrateSpan?.setAttributes({
            ...Attribute.StepArgumentsCount(hydrated.args.length),
            ...Attribute.QueueDeserializeTimeMs(durationMs),
          });
          return hydrated;
        }
      );

      const args = hydratedInput.args;
      const thisVal = hydratedInput.thisVal ?? null;
      const port = isVercel ? undefined : await getPort();

      const executionStartTime = Date.now();
      result = await trace('step.execute', {}, async () => {
        return await contextStorage.run(
          {
            stepMetadata: {
              stepName,
              stepId,
              stepStartedAt: new Date(+stepStartedAt),
              attempt,
            },
            workflowMetadata: {
              workflowName,
              workflowRunId,
              workflowStartedAt: new Date(+workflowStartedAt),
              url: isVercel
                ? `https://${process.env.VERCEL_URL}`
                : `http://localhost:${port ?? 3000}`,
            },
            ops,
            closureVars: hydratedInput.closureVars,
            encryptionKey,
          },
          () => stepFn.apply(thisVal, args)
        );
      });
      const executionTimeMs = Date.now() - executionStartTime;

      span?.setAttributes({
        ...Attribute.QueueExecutionTimeMs(executionTimeMs),
      });

      result = await trace('step.dehydrate', {}, async (dehydrateSpan) => {
        const startTime = Date.now();
        const dehydrated = await dehydrateStepReturnValue(
          result,
          workflowRunId,
          encryptionKey,
          ops
        );
        const durationMs = Date.now() - startTime;
        dehydrateSpan?.setAttributes({
          ...Attribute.QueueSerializeTimeMs(durationMs),
          ...Attribute.StepResultType(typeof dehydrated),
        });
        return dehydrated;
      });

      // Flush pending ops (stream writes, etc.) with a short inline wait.
      // Most ops resolve within ~200ms (flushable pipe detects lock release
      // via 100ms polling). Awaiting inline keeps the V2 loop going without
      // a queue round-trip. If ops don't resolve in 500ms (e.g., a
      // WritableStream kept open across steps), waitUntil handles the rest
      // and the caller can decide to break the loop via hasPendingOps.
      let opsSettled = true;
      if (ops.length > 0) {
        const opsPromise = Promise.all(ops).catch((err) => {
          const isAbortError =
            err?.name === 'AbortError' || err?.name === 'ResponseAborted';
          if (!isAbortError) throw err;
        });
        opsSettled = await Promise.race([
          opsPromise.then(() => true as const),
          new Promise<false>((r) => setTimeout(() => r(false), 500)),
        ]);
        if (!opsSettled) {
          // Ops didn't settle in 500ms — hand off to waitUntil
          waitUntil(opsPromise);
        }
      }

      // Create step_completed event
      let stepCompleted409 = false;
      await world.events
        .create(workflowRunId, {
          eventType: 'step_completed',
          specVersion: SPEC_VERSION_CURRENT,
          correlationId: stepId,
          eventData: {
            result: result as Uint8Array,
          },
        })
        .catch((err) => {
          if (WorkflowAPIError.is(err) && err.status === 409) {
            runtimeLogger.info(
              'Tried completing step, but step has already finished.',
              {
                workflowRunId,
                stepId,
                stepName,
                message: err.message,
              }
            );
            stepCompleted409 = true;
            return;
          }
          throw err;
        });

      if (stepCompleted409) {
        return { type: 'skipped' };
      }

      span?.setAttributes({
        ...Attribute.StepStatus('completed'),
        ...Attribute.StepResultType(typeof result),
      });

      if (ops.length > 0) {
        stepLogger.debug('Step ops status', {
          workflowRunId,
          stepName,
          opsCount: ops.length,
          settled: opsSettled,
        });
      }
      // hasPendingOps = true only when ops didn't settle within the
      // inline timeout. This tells the V2 handler to break the loop
      // and queue a continuation so waitUntil can flush them.
      return { type: 'completed', hasPendingOps: !opsSettled };
    } catch (err: unknown) {
      const normalizedError = await normalizeUnknownError(err);
      const normalizedStack = normalizedError.stack || getErrorStack(err) || '';

      if (err instanceof Error) {
        span?.recordException?.(err);
      }

      const isFatal = FatalError.is(err);

      span?.setAttributes({
        ...Attribute.StepErrorName(getErrorName(err)),
        ...Attribute.StepErrorMessage(normalizedError.message),
        ...Attribute.ErrorType(getErrorName(err)),
        ...Attribute.ErrorCategory(
          isFatal ? 'fatal' : RetryableError.is(err) ? 'retryable' : 'transient'
        ),
        ...Attribute.ErrorRetryable(!isFatal),
      });

      if (WorkflowAPIError.is(err)) {
        if (err.status === 410) {
          stepLogger.info('Workflow run already completed, skipping step', {
            workflowRunId,
            stepId,
            message: err.message,
          });
          return { type: 'gone' };
        }
        if (err.status !== undefined && err.status >= 500) {
          runtimeLogger.warn(
            'Persistent server error (5xx) during step, deferring to queue retry',
            {
              status: err.status,
              workflowRunId,
              stepId,
              error: err.message,
              url: err.url,
            }
          );
          throw err;
        }
      }

      if (isFatal) {
        stepLogger.error(
          'Encountered FatalError while executing step, bubbling up to parent workflow',
          { workflowRunId, stepName, errorStack: normalizedStack }
        );
        try {
          await world.events.create(workflowRunId, {
            eventType: 'step_failed',
            specVersion: SPEC_VERSION_CURRENT,
            correlationId: stepId,
            eventData: {
              error: normalizedError.message,
              stack: normalizedStack,
            },
          });
        } catch (stepFailErr) {
          if (WorkflowAPIError.is(stepFailErr) && stepFailErr.status === 409) {
            runtimeLogger.info(
              'Tried failing step, but step has already finished.',
              {
                workflowRunId,
                stepId,
                stepName,
                message: stepFailErr.message,
              }
            );
            return { type: 'skipped' };
          }
          throw stepFailErr;
        }
        span?.setAttributes({
          ...Attribute.StepStatus('failed'),
          ...Attribute.StepFatalError(true),
        });
        return { type: 'failed' };
      }

      // Non-fatal error: check if retries remaining
      const currentAttempt = step.attempt;

      span?.setAttributes({
        ...Attribute.StepAttempt(currentAttempt),
        ...Attribute.StepMaxRetries(maxRetries),
      });

      if (currentAttempt >= maxRetries + 1) {
        // Max retries reached
        const retryCount = step.attempt - 1;
        stepLogger.error(
          'Max retries reached, bubbling error to parent workflow',
          {
            workflowRunId,
            stepName,
            attempt: step.attempt,
            retryCount,
            errorStack: normalizedStack,
          }
        );
        const errorMessage = `Step "${stepName}" failed after ${maxRetries} ${pluralize('retry', 'retries', maxRetries)}: ${normalizedError.message}`;
        try {
          await world.events.create(workflowRunId, {
            eventType: 'step_failed',
            specVersion: SPEC_VERSION_CURRENT,
            correlationId: stepId,
            eventData: { error: errorMessage, stack: normalizedStack },
          });
        } catch (stepFailErr) {
          if (WorkflowAPIError.is(stepFailErr) && stepFailErr.status === 409) {
            runtimeLogger.info(
              'Tried failing step, but step has already finished.',
              {
                workflowRunId,
                stepId,
                stepName,
                message: stepFailErr.message,
              }
            );
            return { type: 'skipped' };
          }
          throw stepFailErr;
        }
        span?.setAttributes({
          ...Attribute.StepStatus('failed'),
          ...Attribute.StepRetryExhausted(true),
        });
        return { type: 'failed' };
      }

      // Retries remaining
      if (RetryableError.is(err)) {
        stepLogger.info('Encountered RetryableError, step will be retried', {
          workflowRunId,
          stepName,
          attempt: currentAttempt,
          message: err.message,
        });
      } else {
        stepLogger.info('Encountered Error, step will be retried', {
          workflowRunId,
          stepName,
          attempt: currentAttempt,
          errorStack: normalizedStack,
        });
      }

      try {
        await world.events.create(workflowRunId, {
          eventType: 'step_retrying',
          specVersion: SPEC_VERSION_CURRENT,
          correlationId: stepId,
          eventData: {
            error: normalizedError.message,
            stack: normalizedStack,
            ...(RetryableError.is(err) && { retryAfter: err.retryAfter }),
          },
        });
      } catch (stepRetryErr) {
        if (WorkflowAPIError.is(stepRetryErr) && stepRetryErr.status === 409) {
          runtimeLogger.info(
            'Tried retrying step, but step has already finished.',
            {
              workflowRunId,
              stepId,
              stepName,
              message: stepRetryErr.message,
            }
          );
          return { type: 'skipped' };
        }
        throw stepRetryErr;
      }

      const timeoutSeconds = Math.max(
        1,
        RetryableError.is(err)
          ? Math.ceil((+err.retryAfter.getTime() - Date.now()) / 1000)
          : 1
      );

      span?.setAttributes({
        ...Attribute.StepRetryTimeoutSeconds(timeoutSeconds),
        ...Attribute.StepRetryWillRetry(true),
      });

      return { type: 'retry', timeoutSeconds };
    }
  });
}
