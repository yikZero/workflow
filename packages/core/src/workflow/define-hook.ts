import type { Hook as HookEntity } from '@workflow/world';
import { UnavailableInWorkflowContextError } from '../context-errors.js';
import type { Hook, HookOptions } from '../create-hook.js';
import { createHook } from './create-hook.js';

/**
 * NOTE: This is the implementation of `defineHook()` that is used in workflow contexts.
 */
export function defineHook<TInput, TOutput = TInput>() {
  return {
    create(options?: HookOptions): Hook<TOutput> {
      return createHook<TOutput>(options);
    },

    resume(_token: string, _payload: TInput): Promise<HookEntity | null> {
      throw new UnavailableInWorkflowContextError(
        'defineHook().resume()',
        'resuming hooks: https://workflow-sdk.dev/docs/api-reference/workflow-api/resume-hook'
      );
    },
  };
}
