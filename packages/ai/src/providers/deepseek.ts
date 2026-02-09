import { deepseek as deepseekProvider } from '@ai-sdk/deepseek';
import type { CompatibleLanguageModel } from '../agent/types.js';

export function deepseek(
  ...args: Parameters<typeof deepseekProvider>
): () => Promise<CompatibleLanguageModel> {
  return async () => {
    'use step';
    return deepseekProvider(...args) as CompatibleLanguageModel;
  };
}
