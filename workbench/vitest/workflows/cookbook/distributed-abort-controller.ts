/**
 * Cookbook: distributed-abort-controller pattern
 *
 * Demonstrates creating an AbortSignal-compatible interface that works
 * across distributed systems using workflow hooks and streams.
 */
import { defineHook, getWritable } from 'workflow';

// Hook to trigger the abort
export const abortHook = defineHook<{ reason?: string }>();

// Chunk type written to the stream when abort is triggered
export type AbortChunk = {
  type: 'abort';
  reason?: string;
  timestamp: number;
};

// Step to write the abort signal to the stream
async function writeAbortSignal(reason?: string) {
  'use step';

  const writable = getWritable<AbortChunk>();
  const writer = writable.getWriter();

  try {
    await writer.write({
      type: 'abort',
      reason,
      timestamp: Date.now(),
    });
  } finally {
    writer.releaseLock();
  }

  await writable.close();
}

/**
 * The core workflow that backs the distributed abort controller.
 * It waits for the abort hook to be triggered, then writes an abort
 * chunk to the stream for all listeners.
 */
export async function distributedAbortWorkflow(token: string) {
  'use workflow';

  // Wait for the abort hook to be triggered
  const { reason } = await abortHook.create({ token });

  // Write the abort signal to the stream
  await writeAbortSignal(reason);

  return { aborted: true, reason };
}

/**
 * Demo workflow that uses the distributed abort controller pattern
 * to coordinate cancellation with a worker loop.
 */
export async function abortableWorkerDemo(
  abortToken: string,
  maxIterations: number
) {
  'use workflow';

  let aborted = false;
  let abortReason: string | undefined;

  // Listen for abort signal
  const hook = abortHook.create({ token: abortToken });
  hook.then(({ reason }) => {
    aborted = true;
    abortReason = reason;
  });

  const results: Array<{ iteration: number; result: string }> = [];

  for (let i = 0; i < maxIterations; i++) {
    if (aborted) break;
    const work = await doWork(i);
    results.push(work);
  }

  return {
    completed: results.length,
    aborted,
    abortReason,
    results,
  };
}

async function doWork(iteration: number) {
  'use step';
  return { iteration, result: `work-${iteration}` };
}
