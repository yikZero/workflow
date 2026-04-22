/**
 * Verifies the contract the snapshot runtime relies on when wrapping
 * `world.snapshots.save()` and `world.snapshots.load()` with encryption.
 */

import { WorkflowRuntimeError } from '@workflow/errors';
import { describe, expect, it } from 'vitest';
import { importKey } from '../encryption.js';
import {
  decrypt as decryptSerializedData,
  encrypt as encryptSerializedData,
} from '../serialization/encryption.js';
import { peekFormatPrefix } from '../serialization/format.js';
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
