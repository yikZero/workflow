import { groq as groqProvider } from '@ai-sdk/groq';
import type { CompatibleLanguageModel } from '../agent/types.js';

export function groq(
  ...args: Parameters<typeof groqProvider>
): () => Promise<CompatibleLanguageModel> {
  return async () => {
    'use step';
    return groqProvider(...args) as CompatibleLanguageModel;
  };
}
