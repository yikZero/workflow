import { start } from '@workflow/core/runtime/start';
import { hydrateWorkflowArguments } from '@workflow/core/serialization';
import {
  type Event,
  isLegacySpecVersion,
  SPEC_VERSION_LEGACY,
  type World,
} from '@workflow/world';

export interface RecreateRunOptions {
  deploymentId?: string;
  specVersion?: number;
}

export interface StopSleepResult {
  /** Number of pending sleeps that were stopped */
  stoppedCount: number;
}

export interface StopSleepOptions {
  /**
   * Optional list of specific correlation IDs to target.
   * If provided, only these sleep calls will be interrupted.
   * If not provided, all pending sleep calls will be interrupted.
   */
  correlationIds?: string[];
}

const normalizeWorkflowArgs = (args: unknown): unknown[] => {
  return Array.isArray(args) ? args : [args];
};

/**
 * Start a new workflow run based on an existing run.
 */
export async function recreateRunFromExisting(
  world: World,
  runId: string,
  options: RecreateRunOptions = {}
): Promise<string> {
  const run = await world.runs.get(runId, { resolveData: 'all' });
  const workflowArgs = normalizeWorkflowArgs(
    hydrateWorkflowArguments(run.input, globalThis)
  );
  const specVersion =
    options.specVersion ?? run.specVersion ?? SPEC_VERSION_LEGACY;
  const deploymentId = options.deploymentId ?? run.deploymentId;

  const newRun = await start(
    { workflowId: run.workflowName },
    workflowArgs as unknown[],
    {
      deploymentId,
      world,
      specVersion,
    }
  );
  return newRun.runId;
}

/**
 * Cancel a workflow run.
 */
export async function cancelRun(world: World, runId: string): Promise<void> {
  const run = await world.runs.get(runId, { resolveData: 'none' });
  const specVersion = run.specVersion ?? SPEC_VERSION_LEGACY;
  const compatMode = isLegacySpecVersion(specVersion);
  const eventData = {
    eventType: 'run_cancelled' as const,
    specVersion,
  };
  await world.events.create(runId, eventData, { v1Compat: compatMode });
}

/**
 * Re-enqueue a workflow run.
 */
export async function reenqueueRun(world: World, runId: string): Promise<void> {
  const run = await world.runs.get(runId, { resolveData: 'none' });
  await world.queue(
    `__wkf_workflow_${run.workflowName}`,
    {
      runId,
    },
    {
      deploymentId: run.deploymentId,
    }
  );
}

/**
 * Wake up a workflow run by interrupting pending sleep() calls.
 */
export async function wakeUpRun(
  world: World,
  runId: string,
  options?: StopSleepOptions
): Promise<StopSleepResult> {
  const run = await world.runs.get(runId, { resolveData: 'none' });
  const compatMode = isLegacySpecVersion(run.specVersion);

  const eventsResult = await world.events.list({
    runId,
    pagination: { limit: 1000 },
    resolveData: 'none',
  });

  const waitCreatedEvents = eventsResult.data.filter(
    (event: Event) => event.eventType === 'wait_created'
  );
  const waitCompletedCorrelationIds = new Set(
    eventsResult.data
      .filter((event: Event) => event.eventType === 'wait_completed')
      .map((event: Event) => event.correlationId)
  );

  let pendingWaits = waitCreatedEvents.filter(
    (event: Event) => !waitCompletedCorrelationIds.has(event.correlationId)
  );

  if (options?.correlationIds && options.correlationIds.length > 0) {
    const targetCorrelationIds = new Set(options.correlationIds);
    pendingWaits = pendingWaits.filter(
      (event: Event) =>
        event.correlationId && targetCorrelationIds.has(event.correlationId)
    );
  }

  for (const waitEvent of pendingWaits) {
    if (!waitEvent.correlationId) continue;
    const eventData = compatMode
      ? {
          eventType: 'wait_completed' as const,
          correlationId: waitEvent.correlationId,
        }
      : {
          eventType: 'wait_completed' as const,
          correlationId: waitEvent.correlationId,
          specVersion: run.specVersion,
        };
    await world.events.create(runId, eventData, { v1Compat: compatMode });
  }

  if (pendingWaits.length > 0) {
    await world.queue(
      `__wkf_workflow_${run.workflowName}`,
      {
        runId,
      },
      {
        deploymentId: run.deploymentId,
      }
    );
  }

  return { stoppedCount: pendingWaits.length };
}
