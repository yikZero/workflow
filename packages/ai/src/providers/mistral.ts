import { mistral as mistralProvider } from '@ai-sdk/mistral';
import type { CompatibleLanguageModel } from '../agent/types.js';

export function mistral(
  ...args: Parameters<typeof mistralProvider>
): () => Promise<CompatibleLanguageModel> {
  return async () => {
    'use step';
    return mistralProvider(...args) as CompatibleLanguageModel;
  };
}
