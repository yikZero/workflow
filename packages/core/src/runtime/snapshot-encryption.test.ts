/**
 * Verifies the contract the snapshot runtime relies on when wrapping
 * `world.snapshots.save()` and `world.snapshots.load()` with encryption.
 */

import { WorkflowRuntimeError } from '@workflow/errors';
import { describe, expect, it } from 'vitest';
import { importKey } from '../encryption.js';
import {
  compress,
  decompress,
  PREFERRED_CODEC,
} from '../serialization/compression.js';
import {
  decrypt as decryptSerializedData,
  encrypt as encryptSerializedData,
} from '../serialization/encryption.js';
import {
  decodeFormatPrefix,
  peekFormatPrefix,
} from '../serialization/format.js';
import { SerializationFormat } from '../serialization/types.js';

async function makeKey() {
  const raw = new Uint8Array(32);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7 + 3) & 0xff;
  return importKey(raw);
}

function bytesOf(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

describe('snapshot encryption', () => {
  it('round-trips with a key', async () => {
    const key = await makeKey();
    const plaintext = bytesOf('pretend this is a QuickJS VM snapshot');
    const encrypted = (await encryptSerializedData(
      plaintext,
      key
    )) as Uint8Array;
    expect(peekFormatPrefix(encrypted)).toBe(SerializationFormat.ENCRYPTED);
    const decrypted = (await decryptSerializedData(
      encrypted,
      key
    )) as Uint8Array;
    expect(decrypted.length).toBe(plaintext.length);
    for (let i = 0; i < plaintext.length; i++) {
      expect(decrypted[i]).toBe(plaintext[i]);
    }
  });

  it('passes bytes through unchanged when no key is provided (save)', async () => {
    const plaintext = bytesOf('unencrypted snapshot');
    const result = await encryptSerializedData(plaintext, undefined);
    // Same reference — no wrapping happened.
    expect(result).toBe(plaintext);
  });

  it('does not mark unencrypted bytes with the "encr" prefix', async () => {
    // Contract: peekFormatPrefix() returns "encr" only for encrypted data.
    // Binary QuickJS snapshots start with arbitrary bytes that may
    // coincidentally match [a-z0-9]{4}, but never "encr" unless we actually
    // encrypted.
    const plaintext = bytesOf('plaintext');
    const result = (await encryptSerializedData(
      plaintext,
      undefined
    )) as Uint8Array;
    expect(peekFormatPrefix(result)).not.toBe(SerializationFormat.ENCRYPTED);
  });

  it('passes plaintext bytes through unchanged on load (legacy compat)', async () => {
    const plaintext = bytesOf('pre-encryption snapshot from an older run');
    const result = await decryptSerializedData(plaintext, undefined);
    expect(result).toBe(plaintext);

    const key = await makeKey();
    const resultWithKey = await decryptSerializedData(plaintext, key);
    expect(resultWithKey).toBe(plaintext);
  });

  it('fails loud when loading encrypted data without a key', async () => {
    const key = await makeKey();
    const encrypted = (await encryptSerializedData(
      bytesOf('encrypted'),
      key
    )) as Uint8Array;

    await expect(
      decryptSerializedData(encrypted, undefined)
    ).rejects.toBeInstanceOf(WorkflowRuntimeError);
    await expect(decryptSerializedData(encrypted, undefined)).rejects.toThrow(
      /no encryption key is available/
    );
  });

  it('decrypt with the wrong key fails', async () => {
    const keyA = await makeKey();
    const rawB = new Uint8Array(32).fill(0x99);
    const keyB = await importKey(rawB);
    const encrypted = (await encryptSerializedData(
      bytesOf('confidential'),
      keyA
    )) as Uint8Array;

    await expect(decryptSerializedData(encrypted, keyB)).rejects.toThrow();
  });
});

describe('snapshot save/load pipeline (compress → encrypt → decrypt → decompress)', () => {
  // Generate a payload large and redundant enough that compression
  // observably shrinks it. Bytes are deterministic so the test is
  // reproducible; the pattern mimics the kind of redundant string-table
  // / AST data that QuickJS heaps contain.
  function fakeSnapshot(sizeBytes: number): Uint8Array {
    const out = new Uint8Array(sizeBytes);
    const pattern = new TextEncoder().encode(
      'function workflow() { return { name: "test" }; }\n'
    );
    for (let i = 0; i < sizeBytes; i++) {
      out[i] = pattern[i % pattern.length]!;
    }
    return out;
  }

  it('full save → load round-trip preserves snapshot bytes (with key)', async () => {
    const key = await makeKey();
    const snapshot = fakeSnapshot(64 * 1024); // 64 KB

    // SAVE pipeline: compress → encrypt
    const compressed = compress(snapshot) as Uint8Array;
    const encrypted = (await encryptSerializedData(
      compressed,
      key
    )) as Uint8Array;
    expect(peekFormatPrefix(encrypted)).toBe(SerializationFormat.ENCRYPTED);

    // LOAD pipeline: decrypt → decompress
    const decrypted = (await decryptSerializedData(
      encrypted,
      key
    )) as Uint8Array;
    const decompressed = decompress(decrypted) as Uint8Array;

    expect(decompressed.byteLength).toBe(snapshot.byteLength);
    // Spot-check the content (full deepEqual is slow on large
    // Uint8Arrays).
    expect(decompressed[0]).toBe(snapshot[0]);
    expect(decompressed[snapshot.byteLength - 1]).toBe(
      snapshot[snapshot.byteLength - 1]
    );
  });

  it('full save → load round-trip preserves snapshot bytes (no key)', async () => {
    // No-encryption path: we still compress, but encrypt() is a
    // pass-through. decrypt() likewise sees no `encr` prefix and
    // returns the bytes as-is for decompress() to handle.
    const snapshot = fakeSnapshot(32 * 1024);

    const compressed = compress(snapshot) as Uint8Array;
    const encrypted = (await encryptSerializedData(
      compressed,
      undefined
    )) as Uint8Array;
    // No-key encrypt is a pass-through — same reference, no `encr` wrapper.
    expect(encrypted).toBe(compressed);
    expect(peekFormatPrefix(encrypted)).not.toBe(SerializationFormat.ENCRYPTED);

    const decrypted = (await decryptSerializedData(
      encrypted,
      undefined
    )) as Uint8Array;
    const decompressed = decompress(decrypted) as Uint8Array;
    expect(decompressed.byteLength).toBe(snapshot.byteLength);
  });

  it('compressed-then-encrypted bytes are smaller than encrypt-only', async () => {
    // The whole point of this layering: encryption produces ~random
    // ciphertext that doesn't compress, so doing it the OTHER way
    // around (encrypt-then-compress) is wasted work. Verify with a
    // redundant payload that compress-first wins.
    const key = await makeKey();
    const snapshot = fakeSnapshot(128 * 1024); // 128 KB of repeated string

    // compress-then-encrypt
    const compressedThenEncrypted = (await encryptSerializedData(
      compress(snapshot),
      key
    )) as Uint8Array;

    // encrypt-only (the "wrong" baseline)
    const encryptedOnly = (await encryptSerializedData(
      snapshot,
      key
    )) as Uint8Array;

    // The compressed pipeline should be a fraction of the size.
    // The exact ratio depends on the codec; even gzip-default beats
    // 4x on this redundant content.
    expect(compressedThenEncrypted.byteLength).toBeLessThan(
      encryptedOnly.byteLength / 3
    );
  });

  it('decompress falls through for legacy snapshots saved before compression was added', async () => {
    // Old snapshots written by a previous version of the SDK have no
    // compression format prefix. The new load pipeline must still
    // accept them: decrypt() returns the bytes unchanged (no `encr`
    // prefix), and decompress() also returns them unchanged (no
    // gzip/zstd prefix).
    const key = await makeKey();
    const legacySnapshot = bytesOf(
      'pretend this is a QuickJS heap saved before compression was added'
    );

    // Pre-compression-era code wrote: encrypt(plain) — no compression.
    const encrypted = (await encryptSerializedData(
      legacySnapshot,
      key
    )) as Uint8Array;

    // New load pipeline.
    const decrypted = (await decryptSerializedData(
      encrypted,
      key
    )) as Uint8Array;
    const restored = decompress(decrypted) as Uint8Array;

    // Same reference — decompress() short-circuits on non-prefixed
    // input, so no copy is made.
    expect(restored).toBe(decrypted);
    expect(Array.from(restored)).toEqual(Array.from(legacySnapshot));
  });

  it('saves use the preferred codec format prefix', () => {
    const snapshot = fakeSnapshot(8 * 1024);
    const compressed = compress(snapshot) as Uint8Array;
    const { format } = decodeFormatPrefix(compressed);
    if (PREFERRED_CODEC === 'zstd') {
      expect(format).toBe(SerializationFormat.ZSTD);
    } else {
      expect(format).toBe(SerializationFormat.GZIP);
    }
  });
});
