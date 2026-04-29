import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  compress,
  decompress,
  isCompressed,
  PREFERRED_CODEC,
} from './compression.js';
import { decodeFormatPrefix, peekFormatPrefix } from './format.js';
import { SerializationFormat } from './types.js';

describe('compress / decompress', () => {
  it('round-trips a small payload', () => {
    const input = new TextEncoder().encode('hello world');
    const compressed = compress(input) as Uint8Array;
    expect(compressed).toBeInstanceOf(Uint8Array);
    expect(compressed).not.toEqual(input);
    const decompressed = decompress(compressed) as Uint8Array;
    expect(Array.from(decompressed)).toEqual(Array.from(input));
  });

  it('round-trips a highly-redundant 1MB payload (compresses well)', () => {
    const input = new Uint8Array(1024 * 1024).fill(0x41); // all 'A'
    const compressed = compress(input) as Uint8Array;
    // Should compress massively — >100x
    expect(compressed.byteLength).toBeLessThan(input.byteLength / 100);
    const decompressed = decompress(compressed) as Uint8Array;
    expect(decompressed.byteLength).toBe(input.byteLength);
    // Spot-check first/last bytes (full deepEqual on 1MB Uint8Array is slow)
    expect(decompressed[0]).toBe(0x41);
    expect(decompressed[decompressed.byteLength - 1]).toBe(0x41);
  });

  it('uses the preferred codec format prefix', () => {
    const input = new TextEncoder().encode('test data');
    const compressed = compress(input);
    const prefix = peekFormatPrefix(compressed);
    if (PREFERRED_CODEC === 'zstd') {
      expect(prefix).toBe(SerializationFormat.ZSTD);
    } else {
      expect(prefix).toBe(SerializationFormat.GZIP);
    }
  });

  it('returns non-binary inputs unchanged', () => {
    expect(compress('a string' as unknown)).toBe('a string');
    expect(compress(42 as unknown)).toBe(42);
    expect(compress(null as unknown)).toBe(null);
    expect(compress(undefined as unknown)).toBe(undefined);
    expect(decompress('a string' as unknown)).toBe('a string');
  });

  it('is idempotent on already-compressed payloads', () => {
    const input = new TextEncoder().encode('data to compress');
    const compressed = compress(input) as Uint8Array;
    const reCompressed = compress(compressed) as Uint8Array;
    // Second call must short-circuit and return the same Uint8Array, not
    // double-wrap it. Identity check: same reference.
    expect(reCompressed).toBe(compressed);
  });

  it('decompress passes through payloads with no compression prefix', () => {
    const raw = new TextEncoder().encode('not compressed, no prefix');
    expect(decompress(raw)).toBe(raw);
  });

  it('decompress can read gzip-prefixed blobs even when zstd is preferred', () => {
    // Construct a gzip blob manually so we always have one regardless of
    // PREFERRED_CODEC. The decoder side must always handle gzip — older
    // deployments may have written gzip even when newer ones write zstd.
    const innerPayload = new TextEncoder().encode('round trip me');
    const gzipPayload = gzipSync(innerPayload);
    const prefix = new TextEncoder().encode('gzip');
    const blob = new Uint8Array(prefix.length + gzipPayload.length);
    blob.set(prefix, 0);
    blob.set(gzipPayload, prefix.length);

    expect(peekFormatPrefix(blob)).toBe(SerializationFormat.GZIP);
    const out = decompress(blob) as Uint8Array;
    expect(Array.from(out)).toEqual(Array.from(innerPayload));
  });

  it('isCompressed identifies compressed payloads', () => {
    expect(isCompressed(compress(new Uint8Array([1, 2, 3])))).toBe(true);
    expect(isCompressed(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(isCompressed('a string' as unknown)).toBe(false);
    expect(isCompressed(undefined as unknown)).toBe(false);
  });
});

describe('PREFERRED_CODEC feature detection', () => {
  it('reports a known codec', () => {
    expect(['zstd', 'gzip']).toContain(PREFERRED_CODEC);
  });

  it('matches the codec actually emitted by compress()', () => {
    const compressed = compress(new TextEncoder().encode('abc')) as Uint8Array;
    const { format } = decodeFormatPrefix(compressed);
    if (PREFERRED_CODEC === 'zstd') {
      expect(format).toBe(SerializationFormat.ZSTD);
    } else {
      expect(format).toBe(SerializationFormat.GZIP);
    }
  });
});
