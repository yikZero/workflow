import { ThrottleError, WorkflowWorldError } from '@workflow/errors';
import {
  SPEC_VERSION_CURRENT,
  SPEC_VERSION_LEGACY,
  SPEC_VERSION_SUPPORTS_CBOR_QUEUE_TRANSPORT,
} from '@workflow/world';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resumeHook } from './resume-hook.js';
import { getWorld } from './world.js';

// Mock @vercel/functions
vi.mock('@vercel/functions', () => ({
  waitUntil: vi.fn(),
}));

// Mock the world module
vi.mock('./world.js', () => ({
  getWorld: vi.fn(),
  getWorldHandlers: vi.fn(() => ({
    createQueueHandler: vi.fn(() => vi.fn()),
  })),
}));

// Mock telemetry
vi.mock('../telemetry.js', () => ({
  serializeTraceCarrier: vi.fn().mockResolvedValue({}),
  getSpanContextForTraceCarrier: vi.fn().mockResolvedValue(undefined),
  trace: vi.fn((_name, fn) => fn(undefined)),
}));

// Mock serialization
vi.mock('../serialization.js', async () => {
  const actual = await vi.importActual<typeof import('../serialization.js')>(
    '../serialization.js'
  );
  return {
    ...actual,
    dehydrateStepReturnValue: vi
      .fn()
      .mockImplementation(async () => new Uint8Array([1, 2, 3])),
    hydrateStepArguments: vi.fn(async (v: unknown) => v),
  };
});

// Mock capabilities — always allow encryption format so we don't strip keys
vi.mock('../capabilities.js', () => ({
  getRunCapabilities: vi.fn(() => ({
    supportedFormats: new Set(['encr', 'json', 'devj', 'devb', 'bin', 'utf8']),
  })),
}));

interface MockWorldOptions {
  runSpecVersion?: number;
  eventsCreate?: ReturnType<typeof vi.fn>;
  queue?: ReturnType<typeof vi.fn>;
}

function makeMockWorld(opts: MockWorldOptions = {}) {
  const {
    runSpecVersion = SPEC_VERSION_SUPPORTS_CBOR_QUEUE_TRANSPORT,
    eventsCreate = vi.fn().mockResolvedValue({}),
    queue = vi.fn().mockResolvedValue({ messageId: null }),
  } = opts;

  const hook = {
    runId: 'wrun_test',
    hookId: 'hook_test',
    token: 'tok_test',
    ownerId: 'owner_test',
    projectId: 'proj_test',
    environment: 'production',
    createdAt: new Date(),
    specVersion: runSpecVersion,
  };

  const workflowRun = {
    runId: 'wrun_test',
    workflowName: 'test-workflow',
    deploymentId: 'deploy_123',
    status: 'running',
    specVersion: runSpecVersion,
    executionContext: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const world = {
    specVersion: runSpecVersion,
    events: { create: eventsCreate },
    queue,
    hooks: {
      getByToken: vi.fn().mockResolvedValue(hook),
    },
    runs: {
      get: vi.fn().mockResolvedValue(workflowRun),
    },
    getEncryptionKeyForRun: vi.fn().mockResolvedValue(undefined),
  };

  return { world, hook, workflowRun, eventsCreate, queue };
}

describe('resumeHook', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('happy path', () => {
    it('writes hook_received with resumeId; queue payload has NO hookInput (event write succeeded)', async () => {
      const { world, queue, eventsCreate } = makeMockWorld();
      vi.mocked(getWorld).mockReturnValue(world as any);

      const result = await resumeHook('tok_test', { hello: 'world' });

      expect(result.resilientResume).toBeFalsy();
      expect(eventsCreate).toHaveBeenCalledTimes(1);
      expect(queue).toHaveBeenCalledTimes(1);

      const [, eventReq] = eventsCreate.mock.calls[0];
      expect(eventReq.eventType).toBe('hook_received');
      expect(eventReq.correlationId).toBe('hook_test');
      // resumeId is always attached to the direct write on CBOR-capable
      // deployments, so the runtime can dedup if it ever sees a matching
      // hookInput via a retried queue message. In the happy path the queue
      // does NOT carry hookInput, so dedup shouldn't be needed — but the
      // id is cheap and future-proof.
      expect(eventReq.eventData.resumeId).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
      expect(eventReq.eventData.payload).toBeInstanceOf(Uint8Array);

      // Happy path: event write succeeded, so no hookInput on queue payload.
      // This avoids a race where the queue handler could materialize a
      // duplicate hook_received before the direct write commits.
      const [, queuePayload] = queue.mock.calls[0];
      expect(queuePayload.hookInput).toBeUndefined();
    });
  });

  describe('resilient resume (events.create failure)', () => {
    it('sets resilientResume=true when events.create throws ThrottleError (429) and queue succeeds', async () => {
      const eventsCreate = vi
        .fn()
        .mockRejectedValue(new ThrottleError('rate limited'));
      const { world } = makeMockWorld({ eventsCreate });
      vi.mocked(getWorld).mockReturnValue(world as any);

      const result = await resumeHook('tok_test', { data: 1 });

      expect(result.resilientResume).toBe(true);
      expect(result.runId).toBe('wrun_test');
    });

    it('sets resilientResume=true when events.create throws 500 and queue succeeds', async () => {
      const eventsCreate = vi.fn().mockRejectedValue(
        new WorkflowWorldError('Internal Server Error', {
          status: 500,
        })
      );
      const { world, queue } = makeMockWorld({ eventsCreate });
      vi.mocked(getWorld).mockReturnValue(world as any);

      const result = await resumeHook('tok_test', { data: 1 });

      expect(result.resilientResume).toBe(true);
      // Queue must have been called with hookInput so the runtime can
      // materialize hook_received on the other side.
      const [, queuePayload] = queue.mock.calls[0];
      expect(queuePayload.hookInput).toBeDefined();
      expect(queuePayload.hookInput.hookId).toBe('hook_test');
    });

    it('throws when events.create throws a non-retryable error (e.g. 400)', async () => {
      const eventsCreate = vi.fn().mockRejectedValue(
        new WorkflowWorldError('Bad Request', {
          status: 400,
        })
      );
      const { world } = makeMockWorld({ eventsCreate });
      vi.mocked(getWorld).mockReturnValue(world as any);

      await expect(resumeHook('tok_test', { data: 1 })).rejects.toThrow(
        'Bad Request'
      );
    });

    it('throws when queue fails even if events.create succeeds', async () => {
      const queue = vi.fn().mockRejectedValue(new Error('Queue unavailable'));
      const { world } = makeMockWorld({ queue });
      vi.mocked(getWorld).mockReturnValue(world as any);

      await expect(resumeHook('tok_test', { data: 1 })).rejects.toThrow(
        'Queue unavailable'
      );
    });

    it('throws queue error when both events.create and queue fail', async () => {
      const eventsCreate = vi
        .fn()
        .mockRejectedValue(new ThrottleError('rate limited'));
      const queue = vi.fn().mockRejectedValue(new Error('Queue unavailable'));
      const { world } = makeMockWorld({ eventsCreate, queue });
      vi.mocked(getWorld).mockReturnValue(world as any);

      await expect(resumeHook('tok_test', { data: 1 })).rejects.toThrow(
        'Queue unavailable'
      );
    });

    it('does not take resilient path on legacy spec versions (no CBOR queue transport)', async () => {
      const eventsCreate = vi
        .fn()
        .mockRejectedValue(new ThrottleError('rate limited'));
      const { world, queue } = makeMockWorld({
        eventsCreate,
        runSpecVersion: SPEC_VERSION_LEGACY,
      });
      vi.mocked(getWorld).mockReturnValue(world as any);

      // On legacy spec versions the runtime cannot materialize hook_received
      // from queue payload, so we must fail-fast instead of pretending
      // resilient delivery will work.
      await expect(resumeHook('tok_test', { data: 1 })).rejects.toThrow(
        'rate limited'
      );

      // hookInput should NOT be attached to the queue payload on legacy
      if (queue.mock.calls.length > 0) {
        const [, queuePayload] = queue.mock.calls[0];
        expect(queuePayload.hookInput).toBeUndefined();
      }
    });
  });

  describe('sequential dispatch (events.create first, then queue)', () => {
    it('awaits events.create before dispatching to queue (happy path)', async () => {
      // This ordering is important: it avoids a race where the queue handler
      // processes the message and materializes a duplicate hook_received
      // before the direct write commits.
      let eventsCreateResolve: (v: unknown) => void = () => {};
      const eventsCreatePromise = new Promise((resolve) => {
        eventsCreateResolve = resolve;
      });
      const eventsCreate = vi
        .fn()
        .mockImplementation(() => eventsCreatePromise);
      const queue = vi.fn().mockResolvedValue({ messageId: null });

      const { world } = makeMockWorld({ eventsCreate, queue });
      vi.mocked(getWorld).mockReturnValue(world as any);

      const resumePromise = resumeHook('tok_test', { data: 1 });

      // Give microtasks a chance to run. events.create should have been
      // called, but queue should NOT have been — we're waiting for the
      // event write to commit before dispatching.
      await new Promise((r) => setTimeout(r, 10));
      expect(eventsCreate).toHaveBeenCalledTimes(1);
      expect(queue).not.toHaveBeenCalled();

      // Now resolve events.create and verify queue is dispatched.
      eventsCreateResolve({});
      await resumePromise;
      expect(queue).toHaveBeenCalledTimes(1);
    });
  });
});

describe('isRetryableEventError', () => {
  // Indirectly tested via resumeHook above. The helper is also unit-covered
  // via start.test.ts's resilient start suite; no duplicate tests needed.
  it('is exercised via resumeHook resilient resume tests', () => {
    expect(SPEC_VERSION_CURRENT).toBeGreaterThanOrEqual(
      SPEC_VERSION_SUPPORTS_CBOR_QUEUE_TRANSPORT
    );
  });
});
