import { cerebras as cerebrasProvider } from '@ai-sdk/cerebras';
import type { CompatibleLanguageModel } from '../agent/types.js';

export function cerebras(
  ...args: Parameters<typeof cerebrasProvider>
): () => Promise<CompatibleLanguageModel> {
  return async () => {
    'use step';
    return cerebrasProvider(...args) as CompatibleLanguageModel;
  };
}
