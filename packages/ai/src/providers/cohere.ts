import { cohere as cohereProvider } from '@ai-sdk/cohere';
import type { CompatibleLanguageModel } from '../agent/types.js';

export function cohere(
  ...args: Parameters<typeof cohereProvider>
): () => Promise<CompatibleLanguageModel> {
  return async () => {
    'use step';
    return cohereProvider(...args) as CompatibleLanguageModel;
  };
}
