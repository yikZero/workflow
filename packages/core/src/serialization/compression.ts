/**
 * Composable compression layer for serialized data.
 *
 * Wraps/unwraps payloads with gzip or zstd (Node 22.15+) compression,
 * using the format-prefix system to mark compressed data.
 *
 * Why is compression a separate, opt-in layer (not in
 * `serialization/encryption.ts`)? Compression only pays off for
 * larger payloads — gzip/zstd headers (~10-20 bytes) and a CPU pass
 * are wasted on KB-scale CBOR/devalue payloads. The snapshot save
 * path is the only call site today; small payloads (events, hook
 * metadata) skip compression entirely.
 *
 * For the QuickJS heap snapshots produced by `runSnapshotWorkflow`,
 * compression dominates encrypt() in the wire-bytes equation —
 * encryption produces ~random ciphertext that doesn't compress, so
 * `gzip(encrypt(plain))` is wasted work. The intended composition is
 * `encrypt(compress(plain))`: compress first while data is still
 * compressible, then encrypt the (small) result.
 *
 * Codec choice (benchmarked against an 8 MB QuickJS heap snapshot):
 *
 * | codec  | ratio | compress | decompress |
 * |--------|-------|----------|------------|
 * | zstd-3 | 4.29x |    18 ms |       6 ms |
 * | gzip-6 | 4.02x |   127 ms |      11 ms |
 *
 * zstd wins on ratio AND speed, but `node:zlib` only exposes it from
 * Node 22.15. We feature-detect at module init and fall back to gzip
 * on older Node versions. The format prefix on the saved blob marks
 * which codec was used, so an in-flight workflow whose snapshot was
 * written by one codec remains decodable after a deploy that uses the
 * other.
 */

import * as zlib from 'node:zlib';
import {
  decodeFormatPrefix,
  encodeWithFormatPrefix,
  peekFormatPrefix,
} from './format.js';
import { SerializationFormat } from './types.js';

interface SyncCodec {
  compress: (data: Uint8Array) => Uint8Array;
  decompress: (data: Uint8Array) => Uint8Array;
}

const gzipCodec: SyncCodec = {
  compress: (d) => zlib.gzipSync(d),
  decompress: (d) => zlib.gunzipSync(d),
};

/**
 * Detect zstd availability at module init. `node:zlib` exposes
 * `zstdCompressSync` / `zstdDecompressSync` starting in v22.15;
 * older Node versions don't have these symbols, so guard with a
 * typeof check rather than calling them and catching.
 */
const zstdCodec: SyncCodec | null = (() => {
  // biome-ignore lint/suspicious/noExplicitAny: optional API surface
  const z = zlib as any;
  if (typeof z.zstdCompressSync !== 'function') return null;
  if (typeof z.zstdDecompressSync !== 'function') return null;
  return {
    compress: (d) => z.zstdCompressSync(d) as Uint8Array,
    decompress: (d) => z.zstdDecompressSync(d) as Uint8Array,
  };
})();

/**
 * The codec that `compress()` will use for new payloads. Exposed so
 * tests / diagnostics can confirm which codec is in effect.
 *
 * - `'zstd'` on Node >= 22.15
 * - `'gzip'` on older Node versions
 */
export const PREFERRED_CODEC: 'zstd' | 'gzip' = zstdCodec ? 'zstd' : 'gzip';

/**
 * Compress a binary payload. Picks the best available codec
 * (zstd if Node supports it, gzip otherwise) and wraps the result
 * with the corresponding format prefix.
 *
 * Non-binary inputs are returned unchanged. Already-compressed
 * inputs (recognized by their format prefix) are returned unchanged
 * to make the helper idempotent.
 */
export function compress(data: Uint8Array | unknown): Uint8Array | unknown {
  if (!(data instanceof Uint8Array)) return data;

  const existing = peekFormatPrefix(data);
  if (
    existing === SerializationFormat.GZIP ||
    existing === SerializationFormat.ZSTD
  ) {
    return data;
  }

  if (zstdCodec) {
    const compressed = zstdCodec.compress(data);
    return encodeWithFormatPrefix(SerializationFormat.ZSTD, compressed);
  }
  const compressed = gzipCodec.compress(data);
  return encodeWithFormatPrefix(SerializationFormat.GZIP, compressed);
}

/**
 * Decompress a format-prefixed payload. Dispatches on the prefix:
 * `gzip` → `gunzipSync`, `zstd` → `zstdDecompressSync`. Non-compressed
 * inputs (no compression prefix) pass through unchanged so this layer
 * composes cleanly with callers that may receive either wrapped or
 * already-raw data.
 *
 * Throws if a `zstd`-prefixed blob is encountered on a Node version
 * without zstd support — this can only happen if a deployment running
 * a newer Node wrote a snapshot, and a deployment running an older
 * Node tries to read it. The error message is explicit so operators
 * can diagnose the version skew.
 */
export function decompress(data: Uint8Array | unknown): Uint8Array | unknown {
  if (!(data instanceof Uint8Array)) return data;

  const prefix = peekFormatPrefix(data);
  if (prefix === SerializationFormat.GZIP) {
    const { payload } = decodeFormatPrefix(data);
    return gzipCodec.decompress(payload);
  }
  if (prefix === SerializationFormat.ZSTD) {
    if (!zstdCodec) {
      throw new Error(
        'Encountered a zstd-compressed payload but zstd is not available on ' +
          'this Node runtime (requires Node 22.15+). This usually means a ' +
          'snapshot was written by a deployment running a newer Node version ' +
          'and is being read by an older one — upgrade the reading side.'
      );
    }
    const { payload } = decodeFormatPrefix(data);
    return zstdCodec.decompress(payload);
  }
  return data;
}

/** True when the payload carries a compression format prefix. */
export function isCompressed(data: Uint8Array | unknown): boolean {
  if (!(data instanceof Uint8Array)) return false;
  const prefix = peekFormatPrefix(data);
  return (
    prefix === SerializationFormat.GZIP || prefix === SerializationFormat.ZSTD
  );
}
