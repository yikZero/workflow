import { togetherai as togetheraiProvider } from '@ai-sdk/togetherai';
import type { CompatibleLanguageModel } from '../agent/types.js';

export function togetherai(
  ...args: Parameters<typeof togetheraiProvider>
): () => Promise<CompatibleLanguageModel> {
  return async () => {
    'use step';
    return togetheraiProvider(...args) as CompatibleLanguageModel;
  };
}
