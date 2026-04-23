import {
  RUN_ERROR_CODES,
  type RunErrorCode,
  SerializationError,
  WorkflowRuntimeError,
} from '@workflow/errors';
import { classifyRunError } from './classify-error.js';

/**
 * Attribution of a workflow/step failure for presentation.
 *
 * - `user`: the error came from customer code (a step or workflow function
 *   threw, or a value they passed across a boundary wasn't serializable).
 * - `sdk`: the SDK produced the error itself — an internal invariant broke,
 *   or a runtime guard rejected the call. These should be rare; when they
 *   happen we want to frame the terminal output as "this is us, not you."
 */
export type ErrorAttribution = 'user' | 'sdk';

export interface ErrorDescription {
  attribution: ErrorAttribution;
  errorCode: RunErrorCode;
  /**
   * Short, class-aware hint to help a user understand what the error means.
   * Only set for well-known SDK error classes (SerializationError,
   * WorkflowRuntimeError, context-violation errors); `undefined` for plain
   * user errors, where the stack is already the most useful thing to show.
   */
  hint?: string;
}

const CONTEXT_ERROR_NAMES = new Set([
  'NotInWorkflowContextError',
  'NotInStepContextError',
  'NotInWorkflowOrStepContextError',
  'UnavailableInWorkflowContextError',
]);

/**
 * Describe an error for user-facing presentation. Purely informational —
 * does not change any persisted event data or error classification used by
 * the runtime.
 *
 * The attribution here is more nuanced than `classifyRunError`:
 *
 * - `SerializationError` is technically raised by the SDK, but it almost
 *   always points at something the caller did (passed a non-serializable
 *   value, didn't register a class). We attribute it to the user.
 * - Context-violation errors (`NotInWorkflowContextError`, etc.) likewise
 *   describe a user mistake.
 * - `WorkflowRuntimeError` (and subclasses like `StepNotRegisteredError`)
 *   indicates an internal SDK invariant broke — surface that as `sdk`.
 */
export function describeError(err: unknown): ErrorDescription {
  const errorCode = classifyRunError(err);
  const name = err instanceof Error ? err.name : undefined;

  if (SerializationError.is(err)) {
    return {
      attribution: 'user',
      errorCode,
      hint: 'A value passed across a workflow/step boundary could not be serialized. See the error message for the offending path and the Learn More link for details.',
    };
  }

  if (name && CONTEXT_ERROR_NAMES.has(name)) {
    return {
      attribution: 'user',
      errorCode,
      hint: 'A workflow-only or step-only API was called from the wrong context. The error message includes the exact API and how to move the call.',
    };
  }

  if (err instanceof WorkflowRuntimeError) {
    return {
      attribution: 'sdk',
      errorCode,
      hint: 'This is an internal workflow SDK error, not a bug in your code. If it keeps happening, please report it with the stack trace and the runId.',
    };
  }

  if (errorCode === RUN_ERROR_CODES.REPLAY_TIMEOUT) {
    return {
      attribution: 'sdk',
      errorCode,
      hint: 'The workflow replay took too long. This usually means the event log is unusually large or the workflow function is doing heavy synchronous work between step boundaries.',
    };
  }

  if (errorCode === RUN_ERROR_CODES.MAX_DELIVERIES_EXCEEDED) {
    return {
      attribution: 'sdk',
      errorCode,
      hint: 'The workflow queue exceeded its max-delivery budget. This usually indicates a persistent runtime failure — check the most recent stack traces for the underlying cause.',
    };
  }

  return { attribution: 'user', errorCode };
}
