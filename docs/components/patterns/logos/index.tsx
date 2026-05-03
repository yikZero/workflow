import type { ComponentType } from 'react';
import type { RegistryLogoId } from '@/lib/patterns/types';
import { LogoAgentCancellation } from './logo-agent-cancellation';
import { LogoAiSdk } from './logo-ai-sdk';
import { LogoBatching } from './logo-batching';
import { LogoChatSdk } from './logo-chat-sdk';
import { LogoChildWorkflows } from './logo-child-workflows';
import { LogoDistributedAbortController } from './logo-distributed-abort-controller';
import { LogoDurableAgent } from './logo-durable-agent';
import { LogoHumanInTheLoop } from './logo-human-in-the-loop';
import { LogoIdempotency } from './logo-idempotency';
import { LogoRateLimiting } from './logo-rate-limiting';
import { LogoResend } from './logo-resend';
import { LogoSaga } from './logo-saga';
import { LogoSandbox } from './logo-sandbox';
import { LogoScheduling } from './logo-scheduling';
import { LogoSequentialAndParallel } from './logo-sequential-and-parallel';
import { LogoTimeouts } from './logo-timeouts';
import { LogoWebhooks } from './logo-webhooks';
import { LogoUpgradingWorkflows } from './logo-upgrading-workflows';
import { LogoWorkflowComposition } from './logo-workflow-composition';

export interface ProviderLogoProps {
  size?: number;
  className?: string;
}

/**
 * Provider brand marks — keyed by `RegistryLogoId`.
 * When adding a new provider, register its SVG component here.
 */
export const providerLogos: Record<
  RegistryLogoId,
  ComponentType<ProviderLogoProps>
> = {
  resend: LogoResend,
  'ai-sdk': LogoAiSdk,
  sandbox: LogoSandbox,
  'chat-sdk': LogoChatSdk,
  'durable-agent': LogoDurableAgent,
  'human-in-the-loop': LogoHumanInTheLoop,
  'agent-cancellation': LogoAgentCancellation,
  'sequential-and-parallel': LogoSequentialAndParallel,
  'workflow-composition': LogoWorkflowComposition,
  saga: LogoSaga,
  batching: LogoBatching,
  'rate-limiting': LogoRateLimiting,
  scheduling: LogoScheduling,
  timeouts: LogoTimeouts,
  idempotency: LogoIdempotency,
  webhooks: LogoWebhooks,
  'child-workflows': LogoChildWorkflows,
  'distributed-abort-controller': LogoDistributedAbortController,
  'upgrading-workflows': LogoUpgradingWorkflows,
};

export function getProviderLogo(
  id: RegistryLogoId | undefined
): ComponentType<ProviderLogoProps> | null {
  if (!id) return null;
  return providerLogos[id] ?? null;
}
