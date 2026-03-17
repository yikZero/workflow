import { sleep, getWritable } from 'workflow';
import { defineHook } from 'workflow';

// --- Simple step ---

async function add(a: number, b: number): Promise<number> {
  'use step';
  return a + b;
}

// --- Stream step ---

async function writeToStream(
  writable: WritableStream,
  text: string
): Promise<string> {
  'use step';
  const writer = writable.getWriter();
  await writer.write(new TextEncoder().encode(text));
  writer.releaseLock();
  return text;
}

async function closeOutputStream(writable: WritableStream): Promise<void> {
  'use step';
  const writer = writable.getWriter();
  await writer.close();
}

// --- Workflows ---

/**
 * 3 sequential add steps. No streams, no hooks, no sleeps.
 * Expected: 1 flow invocation (all steps inline).
 */
export async function sequentialStepsWorkflow(input: number): Promise<number> {
  'use workflow';
  const a = await add(input, 2);
  const b = await add(a, 3);
  const c = await add(b, 5);
  return c;
}

/**
 * 2 sequential steps that write to a stream, then close it.
 * Expected: 1 flow invocation (ops settle via synchronous flush).
 */
export async function sequentialStepsWithStreamWorkflow(): Promise<string> {
  'use workflow';
  const writable = getWritable();
  const a = await writeToStream(writable, 'hello');
  const b = await writeToStream(writable, ' world');
  await closeOutputStream(writable);
  return a + b;
}

/**
 * A single sleep(1s) followed by a step.
 * Expected: 2 flow invocations (1 to create the wait, 1 after it resumes).
 */
export async function sleepWorkflow(): Promise<number> {
  'use workflow';
  await sleep('1s');
  const result = await add(1, 2);
  return result;
}

/**
 * Promise.all with 2 add steps.
 * Expected: 2 flow invocations (1 inline + 1 background step continuation).
 */
export async function parallelStepsWorkflow(): Promise<number> {
  'use workflow';
  const [a, b] = await Promise.all([add(10, 1), add(20, 2)]);
  return a + b;
}

// --- Hook ---

export const TestHook = defineHook<{ data: string; done?: boolean }>({});

/**
 * Creates a hook, waits for one resume, returns the payload.
 * Expected: 2 flow invocations (1 to create the hook, 1 after resume).
 */
export async function hookWorkflow(token: string): Promise<{ data: string }> {
  'use workflow';
  const hook = TestHook.create({ token });
  const event = await hook.next();
  return { data: event.data };
}
