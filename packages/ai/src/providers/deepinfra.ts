import { deepinfra as deepinfraProvider } from '@ai-sdk/deepinfra';
import type { CompatibleLanguageModel } from '../agent/types.js';

export function deepinfra(
  ...args: Parameters<typeof deepinfraProvider>
): () => Promise<CompatibleLanguageModel> {
  return async () => {
    'use step';
    return deepinfraProvider(...args) as CompatibleLanguageModel;
  };
}
