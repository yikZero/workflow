import { fireworks as fireworksProvider } from '@ai-sdk/fireworks';
import type { CompatibleLanguageModel } from '../agent/types.js';

export function fireworks(
  ...args: Parameters<typeof fireworksProvider>
): () => Promise<CompatibleLanguageModel> {
  return async () => {
    'use step';
    return fireworksProvider(...args) as CompatibleLanguageModel;
  };
}
