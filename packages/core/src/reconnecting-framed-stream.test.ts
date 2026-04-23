import type { World } from '@workflow/world';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./version.js', () => ({ version: '0.0.0-test' }));

import { setWorld } from './runtime/world.js';
import { createReconnectingFramedStream } from './serialization.js';

const FRAME_HEADER_SIZE = 4;

function encodeFrame(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(FRAME_HEADER_SIZE + payload.length);
  new DataView(out.buffer).setUint32(0, payload.length, false);
  out.set(payload, FRAME_HEADER_SIZE);
  return out;
}

function payloadFrame(n: number): Uint8Array {
  return encodeFrame(new Uint8Array([n]));
}

/**
 * Build a stream from a scripted pull sequence. Each entry either
 * enqueues a value or errors — this keeps the stream from transitioning
 * to the errored state before earlier values are actually read (which
 * `start()`-time `controller.error` does immediately).
 */
function scriptedStream(
  steps: Array<
    | { kind: 'value'; value: Uint8Array }
    | { kind: 'error'; err: unknown }
    | { kind: 'close' }
  >,
  onCancel?: (reason?: unknown) => void
): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const step = steps[i++];
      if (!step) {
        controller.close();
        return;
      }
      if (step.kind === 'value') controller.enqueue(step.value);
      else if (step.kind === 'error') controller.error(step.err);
      else controller.close();
    },
    cancel(reason) {
      onCancel?.(reason);
    },
  });
}

async function readAll(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array[]> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    if (r.value) chunks.push(r.value);
  }
  return chunks;
}

/**
 * Builds a mock world whose readFromStream returns a prepared
 * sequence per `startIndex`. Each call records the requested startIndex
 * so assertions can check reconnect positioning.
 */
function makeWorldWithScriptedStreams(
  scripts: Record<number, () => ReadableStream<Uint8Array>>
): { world: World; calls: number[] } {
  const calls: number[] = [];
  const world = {
    readFromStream: vi.fn(async (_name: string, startIndex?: number) => {
      const idx = startIndex ?? 0;
      calls.push(idx);
      const factory = scripts[idx];
      if (!factory) {
        throw new Error(`unexpected startIndex ${idx}`);
      }
      return factory();
    }),
  } as unknown as World;
  return { world, calls };
}

describe('createReconnectingFramedStream', () => {
  afterEach(() => {
    setWorld(undefined as unknown as World);
  });

  it('passes through complete frames and closes cleanly on EOF', async () => {
    const { world, calls } = makeWorldWithScriptedStreams({
      0: () =>
        scriptedStream([
          { kind: 'value', value: payloadFrame(1) },
          { kind: 'value', value: payloadFrame(2) },
          { kind: 'value', value: payloadFrame(3) },
          { kind: 'close' },
        ]),
    });
    setWorld(world);

    const stream = createReconnectingFramedStream('s', 0);
    const chunks = await readAll(stream);

    expect(chunks).toEqual([payloadFrame(1), payloadFrame(2), payloadFrame(3)]);
    expect(calls).toEqual([0]);
  });

  it('forwards a frame delivered across multiple reads', async () => {
    const full = payloadFrame(42);
    const { world } = makeWorldWithScriptedStreams({
      0: () =>
        scriptedStream([
          // Split frame into 3 byte-level reads to prove boundary-aware
          // buffering works regardless of transport chunking.
          { kind: 'value', value: full.slice(0, 2) },
          { kind: 'value', value: full.slice(2, 4) },
          { kind: 'value', value: full.slice(4) },
          { kind: 'close' },
        ]),
    });
    setWorld(world);

    const stream = createReconnectingFramedStream('s', 0);
    const chunks = await readAll(stream);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(full);
  });

  it('reconnects with startIndex = consumed count on upstream error', async () => {
    const { world, calls } = makeWorldWithScriptedStreams({
      0: () =>
        scriptedStream([
          { kind: 'value', value: payloadFrame(1) },
          { kind: 'value', value: payloadFrame(2) },
          // Simulate server 2-minute abort mid-frame: deliver the first
          // 3 bytes of a frame then error. The wrapper should discard
          // those partial bytes and reopen at the right index.
          { kind: 'value', value: payloadFrame(3).slice(0, 3) },
          { kind: 'error', err: new Error('max-duration abort') },
        ]),
      2: () =>
        scriptedStream([
          { kind: 'value', value: payloadFrame(3) },
          { kind: 'value', value: payloadFrame(4) },
          { kind: 'close' },
        ]),
    });
    setWorld(world);

    const stream = createReconnectingFramedStream('s', 0);
    const chunks = await readAll(stream);

    expect(chunks).toEqual([
      payloadFrame(1),
      payloadFrame(2),
      payloadFrame(3),
      payloadFrame(4),
    ]);
    // First connection: startIndex=0. After 2 frames consumed, reconnect
    // opens a fresh stream at startIndex=2.
    expect(calls).toEqual([0, 2]);
  });

  it('respects an initial non-zero startIndex on reconnect', async () => {
    const { world, calls } = makeWorldWithScriptedStreams({
      10: () =>
        scriptedStream([
          { kind: 'value', value: payloadFrame(10) },
          { kind: 'error', err: new Error('abort') },
        ]),
      11: () =>
        scriptedStream([
          { kind: 'value', value: payloadFrame(11) },
          { kind: 'close' },
        ]),
    });
    setWorld(world);

    const stream = createReconnectingFramedStream('s', 10);
    const chunks = await readAll(stream);

    expect(chunks).toEqual([payloadFrame(10), payloadFrame(11)]);
    expect(calls).toEqual([10, 11]);
  });

  it('does not reconnect when startIndex is negative', async () => {
    const { world, calls } = makeWorldWithScriptedStreams({
      [-5]: () =>
        scriptedStream([
          { kind: 'value', value: payloadFrame(99) },
          { kind: 'error', err: new Error('abort') },
        ]),
    });
    setWorld(world);

    const stream = createReconnectingFramedStream('s', -5);
    await expect(readAll(stream)).rejects.toThrow(/abort/);
    expect(calls).toEqual([-5]);
  });

  it('cancel aborts the upstream reader', async () => {
    const cancelSpy = vi.fn();
    const { world } = makeWorldWithScriptedStreams({
      0: () => {
        // Keep the upstream pending after the first value so cancel
        // actually has a live stream to abort; an auto-closed upstream
        // would swallow the cancel per web-streams spec.
        let pulls = 0;
        return new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (pulls++ === 0) {
              controller.enqueue(payloadFrame(1));
              return;
            }
            await new Promise(() => {}); // hang forever
          },
          cancel(reason) {
            cancelSpy(reason);
          },
        });
      },
    });
    setWorld(world);

    const stream = createReconnectingFramedStream('s', 0);
    const reader = stream.getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);

    await reader.cancel('client abort');

    expect(cancelSpy).toHaveBeenCalled();
  });
});
