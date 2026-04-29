import type { ComponentType } from 'react';
import type { RegistryLogoId } from '@/lib/registry/types';
import { LogoAiSdk } from './logo-ai-sdk';
import { LogoChatSdk } from './logo-chat-sdk';
import { LogoResend } from './logo-resend';
import { LogoSandbox } from './logo-sandbox';

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
};

export function getProviderLogo(
  id: RegistryLogoId | undefined
): ComponentType<ProviderLogoProps> | null {
  if (!id) return null;
  return providerLogos[id] ?? null;
}
