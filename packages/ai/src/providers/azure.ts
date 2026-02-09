import { azure as azureProvider } from '@ai-sdk/azure';
import type { CompatibleLanguageModel } from '../agent/types.js';

export function azure(
  ...args: Parameters<typeof azureProvider>
): () => Promise<CompatibleLanguageModel> {
  return async () => {
    'use step';
    return azureProvider(...args) as CompatibleLanguageModel;
  };
}
