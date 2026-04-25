import type { World } from '@workflow/world';
import { describe, expect, it, vi } from 'vitest';
import { getWorkflowQueueName, healthCheck } from './helpers.js';

// Mock the logger to suppress output during tests
vi.mock('../logger.js', () => ({
  runtimeLogger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('getWorkflowQueueName', () => {
  it('should return a valid queue name for a simple workflow name', () => {
    expect(getWorkflowQueueName('myWorkflow')).toBe(
      '__wkf_workflow_myWorkflow'
    );
  });

  it('should allow alphanumeric characters', () => {
    expect(getWorkflowQueueName('workflow123')).toBe(
      '__wkf_workflow_workflow123'
    );
  });

  it('should allow underscores and hyphens', () => {
    expect(getWorkflowQueueName('my_workflow-name')).toBe(
      '__wkf_workflow_my_workflow-name'
    );
  });

  it('should allow dots', () => {
    expect(getWorkflowQueueName('my.workflow')).toBe(
      '__wkf_workflow_my.workflow'
    );
  });

  it('should allow forward slashes', () => {
    expect(getWorkflowQueueName('workflow//module//fn')).toBe(
      '__wkf_workflow_workflow//module//fn'
    );
  });

  it('should allow at signs for scoped package names', () => {
    expect(
      getWorkflowQueueName('workflow//@internal/agent@0.0.0//myWorkflow')
    ).toBe('__wkf_workflow_workflow//@internal/agent@0.0.0//myWorkflow');
  });

  it('should allow scoped packages with subpath exports', () => {
    expect(
      getWorkflowQueueName(
        'workflow//@scope/package/subpath@1.2.3//handleRequest'
      )
    ).toBe(
      '__wkf_workflow_workflow//@scope/package/subpath@1.2.3//handleRequest'
    );
  });

  it('should throw for names containing spaces', () => {
    expect(() => getWorkflowQueueName('my workflow')).toThrow(
      'Invalid workflow name'
    );
  });

  it('should throw for names containing special characters', () => {
    expect(() => getWorkflowQueueName('workflow$name')).toThrow(
      'Invalid workflow name'
    );
    expect(() => getWorkflowQueueName('workflow#name')).toThrow(
      'Invalid workflow name'
    );
    expect(() => getWorkflowQueueName('workflow!name')).toThrow(
      'Invalid workflow name'
    );
  });

  it('should throw for empty string', () => {
    expect(() => getWorkflowQueueName('')).toThrow('Invalid workflow name');
  });
});

describe('healthCheck response parsing', () => {
  /**
   * Builds a minimal `World` whose `streams.get(...)` returns a stream of
   * the supplied response text, simulating what the responding deployment
   * would write via `handleHealthCheckMessage`. Just enough surface for
   * `healthCheck()` to exercise its parse path.
   */
  function makeWorldWithResponse(responseText: string): World {
    return {
      queue: vi.fn().mockResolvedValue(undefined),
      streams: {
        get: vi.fn(async () => {
          let delivered = false;
          return new ReadableStream<Uint8Array>({
            pull(controller) {
              if (!delivered) {
                controller.enqueue(new TextEncoder().encode(responseText));
                delivered = true;
              } else {
                controller.close();
              }
            },
          });
        }),
      },
    } as unknown as World;
  }

  it('surfaces workflowCoreVersion when present in the response', async () => {
    const world = makeWorldWithResponse(
      JSON.stringify({
        healthy: true,
        endpoint: 'workflow',
        specVersion: 3,
        workflowCoreVersion: '5.0.0-beta.7',
        timestamp: Date.now(),
      })
    );

    const result = await healthCheck(world, 'workflow', { timeout: 1000 });

    expect(result.healthy).toBe(true);
    expect(result.specVersion).toBe(3);
    expect(result.workflowCoreVersion).toBe('5.0.0-beta.7');
  });

  it('omits workflowCoreVersion when the response is missing the field (older deployments)', async () => {
    const world = makeWorldWithResponse(
      JSON.stringify({
        healthy: true,
        endpoint: 'workflow',
        specVersion: 2,
        // No workflowCoreVersion — simulates a deployment older than this PR
        timestamp: Date.now(),
      })
    );

    const result = await healthCheck(world, 'workflow', { timeout: 1000 });

    expect(result.healthy).toBe(true);
    expect(result.specVersion).toBe(2);
    expect(result.workflowCoreVersion).toBeUndefined();
  });

  it('omits workflowCoreVersion when the field is the wrong type', async () => {
    // Defensive: the parser only accepts strings. Anything else is dropped
    // rather than surfaced as garbage.
    const world = makeWorldWithResponse(
      JSON.stringify({
        healthy: true,
        endpoint: 'workflow',
        specVersion: 3,
        workflowCoreVersion: 12345,
        timestamp: Date.now(),
      })
    );

    const result = await healthCheck(world, 'workflow', { timeout: 1000 });

    expect(result.healthy).toBe(true);
    expect(result.workflowCoreVersion).toBeUndefined();
  });

  it('returns healthy with no fields for plain-text responses (legacy specVersion < 3)', async () => {
    // Old deployments respond with plain text like
    // 'Workflow SDK "..." endpoint is healthy'. The parser treats any
    // non-empty text as healthy, with no version metadata.
    const world = makeWorldWithResponse(
      'Workflow SDK "workflow" endpoint is healthy'
    );

    const result = await healthCheck(world, 'workflow', { timeout: 1000 });

    expect(result.healthy).toBe(true);
    expect(result.specVersion).toBeUndefined();
    expect(result.workflowCoreVersion).toBeUndefined();
  });
});
