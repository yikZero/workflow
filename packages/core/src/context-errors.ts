import { Ansi } from '@workflow/errors';
import {
  WORKFLOW_CONTEXT_SYMBOL,
  type WorkflowMetadata,
} from './workflow/get-workflow-metadata.js';

/**
 * URL strings shaped as `"<topic>: https://<path>"` so the error surface always
 * shows a human-readable topic alongside the link. The `https://` prefix is
 * enforced by the type to prevent accidental protocol-less URLs.
 */
type DocLink = `${string}: https://${string}`;

/** Apply dim styling to the `workflow/` / `step/` prefixes in a qualified name. */
function ansifyName(name: string): string {
  return name
    .replace(/^workflow\//, `${Ansi.dim('workflow/')}`)
    .replace(/^step\//, `${Ansi.dim('step/')}`);
}

/**
 * Thrown when an API that must run inside a workflow function is called
 * from outside a workflow context (e.g. from a step function or from
 * regular application code).
 *
 * @example
 * ```
 * `createHook()` can only be called inside a workflow function
 * ╰▶ note: Read more about creating hooks: https://...
 * ```
 */
export class NotInWorkflowContextError extends Error {
  name = 'NotInWorkflowContextError';

  constructor(
    readonly functionName: string,
    docLink: DocLink
  ) {
    super(
      Ansi.frame(
        `${Ansi.code(functionName)} can only be called inside a workflow function`,
        [Ansi.note(`Read more about ${docLink}`)]
      )
    );
  }
}

/**
 * Thrown when an API that must run inside a step function is called from
 * outside a step context.
 */
export class NotInStepContextError extends Error {
  name = 'NotInStepContextError';

  constructor(
    readonly functionName: string,
    docLink: DocLink
  ) {
    super(
      Ansi.frame(
        `${Ansi.code(functionName)} can only be called inside a step function`,
        [Ansi.note(`Read more about ${docLink}`)]
      )
    );
  }
}

/**
 * Thrown when an API that must run inside either a workflow or step function
 * is called from regular application code.
 */
export class NotInWorkflowOrStepContextError extends Error {
  name = 'NotInWorkflowOrStepContextError';

  constructor(
    readonly functionName: string,
    docLink: DocLink
  ) {
    super(
      Ansi.frame(
        `${Ansi.code(functionName)} can only be called inside a workflow or step function`,
        [Ansi.note(`Read more about ${docLink}`)]
      )
    );
  }
}

/**
 * Thrown when an API that MUST NOT run inside a workflow function is called
 * from one (e.g. `resumeHook()`, which would cause determinism issues).
 * The message names the specific workflow that made the offending call.
 */
export class UnavailableInWorkflowContextError extends Error {
  name = 'UnavailableInWorkflowContextError';

  constructor(
    readonly functionName: string,
    docLink: DocLink
  ) {
    const ctx = (globalThis as any)[WORKFLOW_CONTEXT_SYMBOL] as
      | WorkflowMetadata
      | undefined;
    const workflowName = ctx?.workflowName;

    const noteLines = [
      workflowName
        ? `this call was made from the ${ansifyName(workflowName)} workflow context.`
        : 'this call was made from a workflow context.',
      `Read more about ${docLink}`,
    ];

    super(
      Ansi.frame(
        `${Ansi.code(functionName)} cannot be called from a workflow context.`,
        [
          'calling this in a workflow context can cause determinism issues.',
          Ansi.note(noteLines),
        ]
      )
    );
  }
}
