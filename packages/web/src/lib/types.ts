import type {
  HealthCheckEndpoint,
  HealthCheckResult,
} from '@workflow/core/runtime/helpers';

/**
 * Shared types used by client and server modules.
 * Keep this file free of server-only imports.
 */

export interface PublicServerConfig {
  backendDisplayName: string;
  backendId: string;
  publicEnv: Record<string, string>;
  sensitiveEnvKeys: string[];
  displayInfo?: Record<string, string>;
}

export type EnvMap = Record<string, string | undefined>;

export interface ServerActionError {
  message: string;
  layer: 'server' | 'API';
  cause?: string;
  request?: {
    operation: string;
    params: Record<string, any>;
    status?: number;
    url?: string;
    code?: string;
  };
}

export type ServerActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServerActionError };

export interface PaginatedResult<T> {
  data: T[];
  cursor?: string;
  hasMore: boolean;
}

export interface StopSleepResult {
  stoppedCount: number;
}

export interface StopSleepOptions {
  correlationIds?: string[];
}

export interface ResumeHookResult {
  hookId: string;
  runId: string;
}

export type { HealthCheckEndpoint, HealthCheckResult };
