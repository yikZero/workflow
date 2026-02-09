import { perplexity as perplexityProvider } from '@ai-sdk/perplexity';
import type { CompatibleLanguageModel } from '../agent/types.js';

export function perplexity(
  ...args: Parameters<typeof perplexityProvider>
): () => Promise<CompatibleLanguageModel> {
  return async () => {
    'use step';
    return perplexityProvider(...args) as CompatibleLanguageModel;
  };
}
