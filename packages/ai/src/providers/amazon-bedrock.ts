import { bedrock as bedrockProvider } from '@ai-sdk/amazon-bedrock';
import type { CompatibleLanguageModel } from '../agent/types.js';

export function bedrock(
  ...args: Parameters<typeof bedrockProvider>
): () => Promise<CompatibleLanguageModel> {
  return async () => {
    'use step';
    return bedrockProvider(...args) as CompatibleLanguageModel;
  };
}
