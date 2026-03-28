import { waitUntil } from '@vercel/functions';
import {
  ThrottleError,
  WorkflowRuntimeError,
  WorkflowWorldError,
} from '@workflow/errors';
import type { WorkflowInvokePayload, World } from '@workflow/world';
import { isLegacySpecVersion, SPEC_VERSION_CURRENT } from '@workflow/world';
import { monotonicFactory } from 'ulid';
import { importKey } from '../encryption.js';
import { runtimeLogger } from '../logger.js';
import type { Serializable } from '../schemas.js';
import { dehydrateWorkflowArguments } from '../serialization.js';
import * as Attribute from '../telemetry/semantic-conventions.js';
import { serializeTraceCarrier, trace } from '../telemetry.js';
import { waitedUntil } from '../util.js';
import { version as workflowCoreVersion } from '../version.js';
import { getWorkflowQueueName } from './helpers.js';
import { Run } from './run.js';
import { getWorld } from './world.js';

/** ULID generator for client-side runId generation */
const ulid = monotonicFactory();

export interface StartOptions {
  /**
   * The deployment ID to use for the workflow run.
   *
   * By default, this is automatically inferred from environment variables
   * when deploying to Vercel.
   *
   * Set to `'latest'` to automatically resolve the most recent deployment
   * for the current environment (same production target or git branch).
   * This is currently a Vercel-specific feature.
   */
  deploymentId?: 'latest' | (string & {});

  /**
   * The world to use for the workflow run creation,
   * by default the world is inferred from the environment variables.
   */
  world?: World;

  /**
   * The spec version to use for the workflow run. Defaults to the latest version.
   */
  specVersion?: number;
}

/**
 * Represents an imported workflow function.
 */
export type WorkflowFunction<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult>;

/**
 * Represents the generated metadata of a workflow function.
 */
export type WorkflowMetadata = { workflowId: string };

/**
 * Starts a workflow run.
 *
 * @param workflow - The imported workflow function to start.
 * @param args - The arguments to pass to the workflow (optional).
 * @param options - The options for the workflow run (optional).
 * @returns The unique run ID for the newly started workflow invocation.
 */
export function start<TArgs extends unknown[], TResult>(
  workflow: WorkflowFunction<TArgs, TResult> | WorkflowMetadata,
  args: TArgs,
  options?: StartOptions
): Promise<Run<TResult>>;

export function start<TResult>(
  workflow: WorkflowFunction<[], TResult> | WorkflowMetadata,
  options?: StartOptions
): Promise<Run<TResult>>;

export async function start<TArgs extends unknown[], TResult>(
  workflow: WorkflowFunction<TArgs, TResult> | WorkflowMetadata,
  argsOrOptions?: TArgs | StartOptions,
  options?: StartOptions
) {
  return await waitedUntil(() => {
    // @ts-expect-error this field is added by our client transform
    const workflowName = workflow?.workflowId;

    if (!workflowName) {
      throw new WorkflowRuntimeError(
        `'start' received an invalid workflow function. Ensure the Workflow Development Kit is configured correctly and the function includes a 'use workflow' directive.`,
        { slug: 'start-invalid-workflow-function' }
      );
    }

    return trace(`workflow.start ${workflowName}`, async (span) => {
      span?.setAttributes({
        ...Attribute.WorkflowName(workflowName),
        ...Attribute.WorkflowOperation('start'),
      });

      let args: Serializable[] = [];
      let opts: StartOptions = options ?? {};
      if (Array.isArray(argsOrOptions)) {
        args = argsOrOptions as Serializable[];
      } else if (typeof argsOrOptions === 'object') {
        opts = argsOrOptions;
      }

      span?.setAttributes({
        ...Attribute.WorkflowArgumentsCount(args.length),
      });

      const world = opts?.world ?? getWorld();
      let deploymentId = opts.deploymentId ?? (await world.getDeploymentId());

      // When 'latest' is requested, resolve the actual latest deployment ID
      // for the current deployment's environment (same production target or
      // same git branch for preview deployments).
      if (deploymentId === 'latest') {
        if (!world.resolveLatestDeploymentId) {
          throw new WorkflowRuntimeError(
            "deploymentId 'latest' requires a World that implements resolveLatestDeploymentId()"
          );
        }
        deploymentId = await world.resolveLatestDeploymentId();
      }

      const ops: Promise<void>[] = [];

      // Generate runId client-side so we have it before serialization
      // (required for future E2E encryption where runId is part of the encryption context)
      const runId = `wrun_${ulid()}`;

      // Serialize current trace context to propagate across queue boundary
      const traceCarrier = await serializeTraceCarrier();

      const specVersion = opts.specVersion ?? SPEC_VERSION_CURRENT;
      const v1Compat = isLegacySpecVersion(specVersion);

      // Resolve encryption key for the new run. The runId has already been
      // generated above (client-generated ULID) and will be used for both
      // key derivation and the run_created event. The World implementation
      // uses the runId for per-run HKDF key derivation. We pass the resolved
      // deploymentId (not just the raw opts) so the World can use it for
      // key resolution even when deploymentId was inferred from the environment
      // rather than explicitly provided in opts (e.g., in e2e test runners).
      const rawKey = await world.getEncryptionKeyForRun?.(runId, {
        ...opts,
        deploymentId,
      });
      const encryptionKey = rawKey ? await importKey(rawKey) : undefined;

      // Create run via run_created event (event-sourced architecture)
      // Pass client-generated runId - server will accept and use it
      const workflowArguments = await dehydrateWorkflowArguments(
        args,
        runId,
        encryptionKey,
        ops,
        globalThis,
        v1Compat
      );

      const executionContext = { traceCarrier, workflowCoreVersion };

      // Create run_created event first, then queue.
      // Sequential to ensure the run exists before the queue message
      // is delivered (local queue delivers fire-and-forget and may
      // process the message before a parallel run_created completes).
      // If run_created fails with 429/5xx, we still enqueue — the
      // runtime will re-create the run via the resilient start path.
      let runCreatedFailed = false;
      try {
        const result = await world.events.create(
          runId,
          {
            eventType: 'run_created',
            specVersion,
            eventData: {
              deploymentId: deploymentId,
              workflowName: workflowName,
              input: workflowArguments,
              executionContext,
            },
          },
          { v1Compat }
        );

        // Assert that the run was created
        if (!result.run) {
          throw new WorkflowRuntimeError(
            "Missing 'run' in server response for 'run_created' event"
          );
        }

        // Verify server accepted our runId
        if (!v1Compat && result.run.runId !== runId) {
          throw new WorkflowRuntimeError(
            `Server returned different runId than requested: expected ${runId}, got ${result.run.runId}`
          );
        }
      } catch (err) {
        // 429 (ThrottleError) and 5xx (WorkflowWorldError with status >= 500)
        // are retryable — enqueue anyway and the runtime will re-create
        // the run via the resilient start path (run_started with runInput).
        if (isRetryableStartError(err)) {
          runtimeLogger.warn(
            'Run creation event failed, but the run will be accepted via the queue. ' +
              'The run_created event will be re-tried async by the runtime.',
            { workflowRunId: runId, error: (err as Error).message }
          );
          runCreatedFailed = true;
        } else {
          throw err;
        }
      }

      await world.queue(
        getWorkflowQueueName(workflowName),
        {
          runId,
          traceCarrier,
          // Only include runInput when run_created failed, so the runtime
          // can re-create the run. In the happy path, omit it to avoid
          // sending Uint8Array through JSON-based queue transports.
          ...(runCreatedFailed
            ? {
                runInput: {
                  input: workflowArguments,
                  deploymentId,
                  workflowName,
                  specVersion,
                  executionContext,
                },
              }
            : {}),
        } satisfies WorkflowInvokePayload,
        {
          deploymentId,
        }
      );

      waitUntil(
        Promise.all(ops).catch((err) => {
          // Ignore expected client disconnect errors (e.g., browser refresh during streaming)
          const isAbortError =
            err?.name === 'AbortError' || err?.name === 'ResponseAborted';
          if (!isAbortError) throw err;
        })
      );

      span?.setAttributes({
        ...Attribute.WorkflowRunId(runId),
        ...Attribute.DeploymentId(deploymentId),
      });

      return new Run<TResult>(runId);
    });
  });
}

/**
 * Checks if an error from events.create (run_created) is retryable,
 * meaning the queue can re-try creation later via the run_started path.
 * - ThrottleError (429): rate limited, will succeed later
 * - WorkflowWorldError with status >= 500: server error, will succeed later
 */
function isRetryableStartError(err: unknown): boolean {
  if (ThrottleError.is(err)) return true;
  if (WorkflowWorldError.is(err) && err.status && err.status >= 500)
    return true;
  return false;
}
