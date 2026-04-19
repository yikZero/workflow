/**
 * Runtime mode selection for workflows.
 *
 * The snapshot runtime is the default. The event-replay runtime is opt-in
 * via the `WORKFLOW_RUNTIME` env var or `executionContext.workflowRuntime`.
 */

import { WorkflowRuntimeError } from '@workflow/errors';

/**
 * Known workflow runtime modes. Any other `WORKFLOW_RUNTIME` value is
 * treated as a misconfiguration and rejected at startup.
 */
export const WORKFLOW_RUNTIMES = ['snapshot', 'replay'] as const;

export type WorkflowRuntimeMode = (typeof WORKFLOW_RUNTIMES)[number];

/**
 * Read and validate the `WORKFLOW_RUNTIME` env var.
 *
 * Returns the configured mode, or `undefined` if unset/empty.
 * Throws {@link WorkflowRuntimeError} if the value is set but not one of
 * the known modes — catching misconfiguration early is better than
 * silently falling back to the default.
 */
export function getWorkflowRuntimeFromEnv(
  env: NodeJS.ProcessEnv = process.env
): WorkflowRuntimeMode | undefined {
  const raw = env.WORKFLOW_RUNTIME;
  if (raw === undefined || raw === '') return undefined;
  if ((WORKFLOW_RUNTIMES as readonly string[]).includes(raw)) {
    return raw as WorkflowRuntimeMode;
  }
  throw new WorkflowRuntimeError(
    `Invalid WORKFLOW_RUNTIME value: "${raw}". ` +
      `Expected one of: ${WORKFLOW_RUNTIMES.join(', ')}.`
  );
}
