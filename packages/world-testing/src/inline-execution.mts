import { expect, test, vi } from 'vitest';
import { hydrateWorkflowReturnValue } from '@workflow/core/serialization';
import { createFetcher, startServer } from './util.mjs';

export function inlineExecution(world: string) {
  test(
    'sequential steps complete in a single flow invocation',
    { timeout: 30_000 },
    async () => {
      const server = await startServer({ world }).then(createFetcher);

      // addTenWorkflow: add(input, 2) → add(a, 3) → add(b, 5)
      // 3 sequential steps with simple number args — no stream ops.
      // The V2 inline execution loop should process all 3 steps within
      // a single queue message delivery (1 flow invocation).
      const result = await server.invoke(
        'workflows/addition.ts',
        'addTenWorkflow',
        [10]
      );
      expect(result.runId).toMatch(/^wrun_.+/);

      const run = await vi.waitFor(
        async () => {
          const run = await server.getRun(result.runId);
          expect(run.status).toBe('completed');
          return run;
        },
        { interval: 200, timeout: 29_000 }
      );

      // Verify the workflow completed with the correct result
      // addTenWorkflow(10) = add(10, 2) → add(12, 3) → add(15, 5) = 20
      const output = await hydrateWorkflowReturnValue(
        run.output!,
        run.runId,
        undefined
      );
      expect(output).toBe(20);

      // The V2 handler should process all steps inline within 1 invocation.
      // On V1 (without inline loop), each step required a separate invocation.
      const invocationCount = await server.getFlowInvocationCount(result.runId);
      expect(invocationCount).toBe(1);
    }
  );
}
