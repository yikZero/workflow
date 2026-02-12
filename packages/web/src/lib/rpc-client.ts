import type {
  Event,
  Hook,
  Step,
  WorkflowRun,
  WorkflowRunStatus,
} from '@workflow/world';
import { decode, encode } from 'cbor-x';
import type {
  EnvMap,
  HealthCheckEndpoint,
  HealthCheckResult,
  PaginatedResult,
  PublicServerConfig,
  ResumeHookResult,
  ServerActionResult,
  StopSleepOptions,
  StopSleepResult,
} from '@/lib/types';

/**
 * RPC client using CBOR encoding for the request/response transport.
 * CBOR preserves Uint8Array and other binary types natively, avoiding
 * the lossy JSON round-trip that converts them to plain objects/arrays.
 *
 * Note: readStreamServerAction is NOT sent via this RPC — streams are
 * fetched directly from /api/stream/:streamId as an octet-stream.
 */
async function rpc<T>(method: string, params?: any): Promise<T> {
  const response = await fetch('/api/rpc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/cbor',
      Accept: 'application/cbor',
    },
    body: new Uint8Array(encode({ method, params: params ?? {} })),
  });

  if (!response.ok) {
    let errorMessage = `RPC call ${method} failed: ${response.status} ${response.statusText}`;
    try {
      const buffer = await response.arrayBuffer();
      const errorBody = decode(new Uint8Array(buffer));
      if (errorBody?.error?.message) {
        errorMessage = errorBody.error.message;
      }
    } catch {
      // If CBOR decode fails, use the generic message
    }
    throw new Error(errorMessage);
  }

  const buffer = await response.arrayBuffer();
  return decode(new Uint8Array(buffer)) as T;
}

export async function fetchRuns(
  worldEnv: EnvMap,
  params: {
    cursor?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    workflowName?: string;
    status?: WorkflowRunStatus;
  }
): Promise<ServerActionResult<PaginatedResult<WorkflowRun>>> {
  return rpc('fetchRuns', { worldEnv, params });
}

export async function fetchRun(
  worldEnv: EnvMap,
  runId: string,
  resolveData: 'none' | 'all' = 'all'
): Promise<ServerActionResult<WorkflowRun>> {
  return rpc('fetchRun', { worldEnv, runId, resolveData });
}

export async function fetchSteps(
  worldEnv: EnvMap,
  runId: string,
  params: {
    cursor?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
  }
): Promise<ServerActionResult<PaginatedResult<Step>>> {
  return rpc('fetchSteps', { worldEnv, runId, params });
}

export async function fetchStep(
  worldEnv: EnvMap,
  runId: string,
  stepId: string,
  resolveData: 'none' | 'all' = 'all'
): Promise<ServerActionResult<Step>> {
  return rpc('fetchStep', { worldEnv, runId, stepId, resolveData });
}

export async function fetchEvents(
  worldEnv: EnvMap,
  runId: string,
  params: {
    cursor?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
  }
): Promise<ServerActionResult<PaginatedResult<Event>>> {
  return rpc('fetchEvents', { worldEnv, runId, params });
}

export async function fetchEventsByCorrelationId(
  worldEnv: EnvMap,
  correlationId: string,
  params: {
    cursor?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    withData?: boolean;
  }
): Promise<ServerActionResult<PaginatedResult<Event>>> {
  return rpc('fetchEventsByCorrelationId', { worldEnv, correlationId, params });
}

export async function fetchHooks(
  worldEnv: EnvMap,
  params: {
    runId?: string;
    cursor?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
  }
): Promise<ServerActionResult<PaginatedResult<Hook>>> {
  return rpc('fetchHooks', { worldEnv, params });
}

export async function fetchHook(
  worldEnv: EnvMap,
  hookId: string,
  resolveData: 'none' | 'all' = 'all'
): Promise<ServerActionResult<Hook>> {
  return rpc('fetchHook', { worldEnv, hookId, resolveData });
}

export async function cancelRun(
  worldEnv: EnvMap,
  runId: string
): Promise<ServerActionResult<void>> {
  return rpc('cancelRun', { worldEnv, runId });
}

export async function recreateRun(
  worldEnv: EnvMap,
  runId: string,
  deploymentId?: string
): Promise<ServerActionResult<string>> {
  return rpc('recreateRun', { worldEnv, runId, deploymentId });
}

export async function reenqueueRun(
  worldEnv: EnvMap,
  runId: string
): Promise<ServerActionResult<void>> {
  return rpc('reenqueueRun', { worldEnv, runId });
}

export async function wakeUpRun(
  worldEnv: EnvMap,
  runId: string,
  options?: StopSleepOptions
): Promise<ServerActionResult<StopSleepResult>> {
  return rpc('wakeUpRun', { worldEnv, runId, options });
}

export async function resumeHook(
  worldEnv: EnvMap,
  token: string,
  payload: unknown
): Promise<ServerActionResult<ResumeHookResult>> {
  return rpc('resumeHook', { worldEnv, token, payload });
}

export async function fetchStreams(
  worldEnv: EnvMap,
  runId: string
): Promise<ServerActionResult<string[]>> {
  return rpc('fetchStreams', { worldEnv, runId });
}

export async function fetchWorkflowsManifest(
  worldEnv: EnvMap
): Promise<ServerActionResult<any>> {
  return rpc('fetchWorkflowsManifest', { worldEnv });
}

export async function runHealthCheck(
  worldEnv: EnvMap,
  endpoint: HealthCheckEndpoint,
  options?: { timeout?: number }
): Promise<ServerActionResult<HealthCheckResult>> {
  return rpc('runHealthCheck', { worldEnv, endpoint, options });
}

export async function getPublicServerConfig(): Promise<PublicServerConfig> {
  return rpc('getPublicServerConfig', {});
}
