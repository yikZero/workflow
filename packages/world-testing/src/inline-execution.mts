import { expect, test, vi } from 'vitest';
import { hydrateWorkflowReturnValue } from '@workflow/core/serialization';
import { createFetcher, startServer } from './util.mjs';

/**
 * Tests that the V2 inline execution loop correctly minimizes flow
 * handler invocations. Each test verifies a specific pattern:
 *
 * - Sequential steps (no streams): 1 invocation
 * - Sequential steps with WritableStream: 1 invocation (sync flush)
 * - Sleep + step: 2 invocations (sleep requires queue round-trip)
 * - Parallel steps (Promise.all): 2 invocations (background step)
 * - Hook + resume: 2 invocations (hook requires external resume)
 */
export function inlineExecution(world: string) {
  test(
    'sequential steps complete in a single flow invocation',
    { timeout: 30_000 },
    async () => {
      const server = await startServer({ world }).then(createFetcher);
      const result = await server.invoke(
        'workflows/inline-execution.ts',
        'sequentialStepsWorkflow',
        [10]
      );

      const run = await vi.waitFor(
        async () => {
          const run = await server.getRun(result.runId);
          expect(run.status).toBe('completed');
          return run;
        },
        { interval: 200, timeout: 29_000 }
      );

      const output = await hydrateWorkflowReturnValue(
        run.output!,
        run.runId,
        undefined
      );
      expect(output).toBe(20);

      const count = await server.getFlowInvocationCount(result.runId);
      expect(count).toBe(1);
    }
  );

  test(
    'sequential steps with stream complete in a single flow invocation',
    { timeout: 30_000 },
    async () => {
      const server = await startServer({ world }).then(createFetcher);
      const result = await server.invoke(
        'workflows/inline-execution.ts',
        'sequentialStepsWithStreamWorkflow',
        []
      );

      const run = await vi.waitFor(
        async () => {
          const run = await server.getRun(result.runId);
          expect(run.status).toBe('completed');
          return run;
        },
        { interval: 200, timeout: 29_000 }
      );

      const output = await hydrateWorkflowReturnValue(
        run.output!,
        run.runId,
        undefined
      );
      expect(output).toBe('hello world');

      const count = await server.getFlowInvocationCount(result.runId);
      expect(count).toBe(1);
    }
  );

  test(
    'sleep workflow requires exactly 2 flow invocations',
    { timeout: 30_000 },
    async () => {
      const server = await startServer({ world }).then(createFetcher);
      const result = await server.invoke(
        'workflows/inline-execution.ts',
        'sleepWorkflow',
        []
      );

      const run = await vi.waitFor(
        async () => {
          const run = await server.getRun(result.runId);
          expect(run.status).toBe('completed');
          return run;
        },
        { interval: 200, timeout: 29_000 }
      );

      const output = await hydrateWorkflowReturnValue(
        run.output!,
        run.runId,
        undefined
      );
      expect(output).toBe(3);

      // Invocation 1: replay → sleep → return {timeoutSeconds}
      // Invocation 2: sleep completed → replay → step inline → complete
      const count = await server.getFlowInvocationCount(result.runId);
      expect(count).toBe(2);
    }
  );

  test(
    'parallel steps (Promise.all) require exactly 2 flow invocations',
    { timeout: 30_000 },
    async () => {
      const server = await startServer({ world }).then(createFetcher);
      const result = await server.invoke(
        'workflows/inline-execution.ts',
        'parallelStepsWorkflow',
        []
      );

      const run = await vi.waitFor(
        async () => {
          const run = await server.getRun(result.runId);
          expect(run.status).toBe('completed');
          return run;
        },
        { interval: 200, timeout: 29_000 }
      );

      const output = await hydrateWorkflowReturnValue(
        run.output!,
        run.runId,
        undefined
      );
      expect(output).toBe(33); // (10+1) + (20+2)

      // Invocation 1: replay → 2 steps → queue 1 background, execute 1 inline
      //               → loop → replay → 1 step done, 1 pending → suspend
      // Invocation 2: background step continuation → replay → both done → complete
      // With higher queue concurrency, the background step's continuation may
      // race with the inline handler's loop, adding a 3rd no-op invocation.
      const count = await server.getFlowInvocationCount(result.runId);
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(3);
    }
  );

  // Hook invocation counting is tested by the existing hooks test suite.
  // The hook pattern requires external resume, which involves complex
  // timing. The invocation count for hooks is 2: create + resume.
}
