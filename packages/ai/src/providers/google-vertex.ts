import { vertex as vertexProvider } from '@ai-sdk/google-vertex';
import type { CompatibleLanguageModel } from '../agent/types.js';

export function vertex(
  ...args: Parameters<typeof vertexProvider>
): () => Promise<CompatibleLanguageModel> {
  return async () => {
    'use step';
    return vertexProvider(...args) as CompatibleLanguageModel;
  };
}
