import { decode, encode } from 'cbor-x';
import {
  cancelRun,
  fetchEvents,
  fetchEventsByCorrelationId,
  fetchHook,
  fetchHooks,
  fetchRun,
  fetchRuns,
  fetchStep,
  fetchSteps,
  fetchStreams,
  fetchWorkflowsManifest,
  getPublicServerConfig,
  recreateRun,
  reenqueueRun,
  resumeHook,
  runHealthCheck,
  wakeUpRun,
} from '@/server/workflow-server-actions';

type RpcHandlers = {
  fetchRuns: (p: any) => Promise<unknown>;
  fetchRun: (p: any) => Promise<unknown>;
  fetchSteps: (p: any) => Promise<unknown>;
  fetchStep: (p: any) => Promise<unknown>;
  fetchEvents: (p: any) => Promise<unknown>;
  fetchEventsByCorrelationId: (p: any) => Promise<unknown>;
  fetchHooks: (p: any) => Promise<unknown>;
  fetchHook: (p: any) => Promise<unknown>;
  cancelRun: (p: any) => Promise<unknown>;
  recreateRun: (p: any) => Promise<unknown>;
  reenqueueRun: (p: any) => Promise<unknown>;
  wakeUpRun: (p: any) => Promise<unknown>;
  resumeHook: (p: any) => Promise<unknown>;
  fetchStreams: (p: any) => Promise<unknown>;
  fetchWorkflowsManifest: (p: any) => Promise<unknown>;
  runHealthCheck: (p: any) => Promise<unknown>;
  getPublicServerConfig: (_p: any) => Promise<unknown>;
};

const handlers: RpcHandlers = {
  fetchRuns: (p) => fetchRuns(p.worldEnv ?? {}, p.params ?? {}),
  fetchRun: (p) => fetchRun(p.worldEnv ?? {}, p.runId, p.resolveData),
  fetchSteps: (p) => fetchSteps(p.worldEnv ?? {}, p.runId, p.params ?? {}),
  fetchStep: (p) =>
    fetchStep(p.worldEnv ?? {}, p.runId, p.stepId, p.resolveData),
  fetchEvents: (p) => fetchEvents(p.worldEnv ?? {}, p.runId, p.params ?? {}),
  fetchEventsByCorrelationId: (p) =>
    fetchEventsByCorrelationId(
      p.worldEnv ?? {},
      p.correlationId,
      p.params ?? {}
    ),
  fetchHooks: (p) => fetchHooks(p.worldEnv ?? {}, p.params ?? {}),
  fetchHook: (p) => fetchHook(p.worldEnv ?? {}, p.hookId, p.resolveData),
  cancelRun: (p) => cancelRun(p.worldEnv ?? {}, p.runId),
  recreateRun: (p) => recreateRun(p.worldEnv ?? {}, p.runId, p.deploymentId),
  reenqueueRun: (p) => reenqueueRun(p.worldEnv ?? {}, p.runId),
  wakeUpRun: (p) => wakeUpRun(p.worldEnv ?? {}, p.runId, p.options),
  resumeHook: (p) => resumeHook(p.worldEnv ?? {}, p.token, p.payload),
  fetchStreams: (p) => fetchStreams(p.worldEnv ?? {}, p.runId),
  fetchWorkflowsManifest: (p) => fetchWorkflowsManifest(p.worldEnv ?? {}),
  runHealthCheck: (p) =>
    runHealthCheck(p.worldEnv ?? {}, p.endpoint, p.options),
  getPublicServerConfig: () => getPublicServerConfig(),
};

function cborResponse(data: unknown, status = 200): Response {
  return new Response(new Uint8Array(encode(data)), {
    status,
    headers: { 'Content-Type': 'application/cbor' },
  });
}

/**
 * Parse the request body, supporting both CBOR and JSON.
 * CBOR is the primary format; JSON is accepted as a fallback.
 */
async function parseBody(
  request: Request
): Promise<{ method: keyof RpcHandlers; params?: any }> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/cbor')) {
    const buffer = await request.arrayBuffer();
    return decode(new Uint8Array(buffer));
  }
  return request.json();
}

export async function POST(request: Request): Promise<Response> {
  let body: { method: keyof RpcHandlers; params?: any };
  try {
    body = await parseBody(request);
  } catch {
    return cborResponse(
      {
        success: false,
        error: { message: 'Malformed request body', layer: 'server' },
      },
      400
    );
  }

  const { method, params } = body;
  if (!method || !(method in handlers)) {
    return cborResponse(
      {
        success: false,
        error: {
          message: `Unknown method: ${String(method)}`,
          layer: 'server',
        },
      },
      400
    );
  }

  try {
    const result = await handlers[method](params ?? {});
    return cborResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return cborResponse(
      { success: false, error: { message, layer: 'server' } },
      500
    );
  }
}
