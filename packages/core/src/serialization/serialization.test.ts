import { describe, it, expect } from 'vitest';
import * as workflow from './workflow.js';
import * as step from './step.js';
import * as client from './client.js';
import { devalueCodec } from './codec-devalue.js';
import {
  encodeWithFormatPrefix,
  decodeFormatPrefix,
  peekFormatPrefix,
  isEncrypted,
} from './format.js';
import { SerializationFormat, isFormatPrefix } from './types.js';
import { importKey } from '../encryption.js';

// ---- isFormatPrefix type guard ----

describe('isFormatPrefix', () => {
  it('should accept valid 4-char lowercase alphanumeric strings', () => {
    expect(isFormatPrefix('devl')).toBe(true);
    expect(isFormatPrefix('cbor')).toBe(true);
    expect(isFormatPrefix('json')).toBe(true);
    expect(isFormatPrefix('encr')).toBe(true);
    expect(isFormatPrefix('abcd')).toBe(true);
    expect(isFormatPrefix('v2b1')).toBe(true);
    expect(isFormatPrefix('0000')).toBe(true);
    expect(isFormatPrefix('9999')).toBe(true);
    expect(isFormatPrefix('ab12')).toBe(true);
  });

  it('should reject strings that are too short', () => {
    expect(isFormatPrefix('')).toBe(false);
    expect(isFormatPrefix('a')).toBe(false);
    expect(isFormatPrefix('ab')).toBe(false);
    expect(isFormatPrefix('abc')).toBe(false);
  });

  it('should reject strings that are too long', () => {
    expect(isFormatPrefix('abcde')).toBe(false);
    expect(isFormatPrefix('abcdef')).toBe(false);
  });

  it('should reject uppercase characters', () => {
    expect(isFormatPrefix('DEVL')).toBe(false);
    expect(isFormatPrefix('Devl')).toBe(false);
    expect(isFormatPrefix('devL')).toBe(false);
  });

  it('should reject special characters', () => {
    expect(isFormatPrefix('de-l')).toBe(false);
    expect(isFormatPrefix('de_l')).toBe(false);
    expect(isFormatPrefix('de.l')).toBe(false);
    expect(isFormatPrefix('de l')).toBe(false);
  });
});

// ---- Format prefix ----

describe('format prefix', () => {
  it('should encode and decode format prefix', () => {
    const payload = new Uint8Array([1, 2, 3]);
    const encoded = encodeWithFormatPrefix(
      SerializationFormat.DEVALUE_V1,
      payload
    ) as Uint8Array;

    expect(encoded.length).toBe(4 + 3);
    const decoded = decodeFormatPrefix(encoded);
    expect(decoded.format).toBe('devl');
    expect(decoded.payload).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('should peek format prefix', () => {
    const payload = new Uint8Array([1, 2, 3]);
    const encoded = encodeWithFormatPrefix(
      SerializationFormat.DEVALUE_V1,
      payload
    ) as Uint8Array;

    expect(peekFormatPrefix(encoded)).toBe('devl');
    expect(peekFormatPrefix(new Uint8Array([0, 0, 0, 0]))).toBeNull();
    expect(peekFormatPrefix('not binary')).toBeNull();
  });

  it('should accept unknown but valid format prefixes', () => {
    // A future codec can use any [a-z0-9]{4} prefix
    const payload = new Uint8Array([1, 2, 3]);
    const encoded = encodeWithFormatPrefix(
      'cbor' as any,
      payload
    ) as Uint8Array;
    expect(peekFormatPrefix(encoded)).toBe('cbor');

    const decoded = decodeFormatPrefix(encoded);
    expect(decoded.format).toBe('cbor');
    expect(decoded.payload).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('should detect encrypted data', () => {
    const payload = new Uint8Array([1, 2, 3]);
    const devl = encodeWithFormatPrefix(
      SerializationFormat.DEVALUE_V1,
      payload
    );
    const encr = encodeWithFormatPrefix(SerializationFormat.ENCRYPTED, payload);

    expect(isEncrypted(devl)).toBe(false);
    expect(isEncrypted(encr)).toBe(true);
  });
});

// ---- Devalue codec ----

describe('devalue codec', () => {
  it('should have the correct format prefix', () => {
    expect(devalueCodec.formatPrefix).toBe('devl');
  });

  it('should round-trip primitives', () => {
    for (const value of [42, 'hello', true, null]) {
      const serialized = devalueCodec.serialize(value, 'workflow');
      const deserialized = devalueCodec.deserialize(serialized, 'workflow');
      expect(deserialized).toEqual(value);
    }
  });

  it('should round-trip Date via workflow mode', () => {
    const date = new Date('2025-01-01T00:00:00Z');
    const serialized = devalueCodec.serialize(date, 'workflow');
    const deserialized = devalueCodec.deserialize(
      serialized,
      'workflow'
    ) as Date;
    expect(deserialized).toBeInstanceOf(Date);
    expect(deserialized.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });
});

// ---- Workflow mode ----

describe('workflow.serialize / workflow.deserialize', () => {
  it('should round-trip primitives', () => {
    expect(workflow.deserialize(workflow.serialize(42))).toBe(42);
    expect(workflow.deserialize(workflow.serialize('hello'))).toBe('hello');
    expect(workflow.deserialize(workflow.serialize(true))).toBe(true);
    expect(workflow.deserialize(workflow.serialize(null))).toBe(null);
  });

  it('should round-trip arrays and objects', () => {
    const value = { a: 1, b: [2, 3], c: { d: 'e' } };
    expect(workflow.deserialize(workflow.serialize(value))).toEqual(value);
  });

  it('should round-trip Date', () => {
    const date = new Date('2025-06-15T12:00:00Z');
    const result = workflow.deserialize(workflow.serialize(date)) as Date;
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2025-06-15T12:00:00.000Z');
  });

  it('should round-trip Error', () => {
    const err = new TypeError('test error');
    const result = workflow.deserialize(workflow.serialize(err)) as Error;
    expect(result).toBeInstanceOf(Error);
    expect(result.name).toBe('TypeError');
    expect(result.message).toBe('test error');
  });

  it('should round-trip Map', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const result = workflow.deserialize(workflow.serialize(map)) as Map<
      string,
      number
    >;
    expect(result).toBeInstanceOf(Map);
    expect(result.get('a')).toBe(1);
    expect(result.get('b')).toBe(2);
  });

  it('should round-trip Set', () => {
    const set = new Set([1, 2, 3]);
    const result = workflow.deserialize(workflow.serialize(set)) as Set<number>;
    expect(result).toBeInstanceOf(Set);
    expect(result.has(1)).toBe(true);
    expect(result.has(3)).toBe(true);
  });

  it('should round-trip BigInt', () => {
    const value = 9007199254740993n;
    const result = workflow.deserialize(workflow.serialize(value));
    expect(result).toBe(value);
  });

  it('should round-trip Uint8Array', () => {
    const value = new Uint8Array([1, 2, 3, 4, 5]);
    const result = workflow.deserialize(
      workflow.serialize(value)
    ) as Uint8Array;
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should round-trip URL', () => {
    const url = new URL('https://example.com/path?q=1');
    const result = workflow.deserialize(workflow.serialize(url)) as URL;
    expect(result).toBeInstanceOf(URL);
    expect(result.href).toBe('https://example.com/path?q=1');
  });

  it('should round-trip RegExp', () => {
    const re = /foo.*bar/gi;
    const result = workflow.deserialize(workflow.serialize(re)) as RegExp;
    expect(result).toBeInstanceOf(RegExp);
    expect(result.source).toBe('foo.*bar');
    expect(result.flags).toBe('gi');
  });

  it('should produce format-prefixed output', () => {
    const serialized = workflow.serialize(42);
    expect(serialized).toBeInstanceOf(Uint8Array);
    expect(peekFormatPrefix(serialized)).toBe('devl');
  });
});

// ---- Step mode ----

describe('step.serialize / step.deserialize', () => {
  it('should round-trip primitives', async () => {
    const serialized = await step.serialize(42);
    const result = await step.deserialize(serialized);
    expect(result).toBe(42);
  });

  it('should round-trip Date', async () => {
    const date = new Date('2025-01-01');
    const serialized = await step.serialize(date);
    const result = (await step.deserialize(serialized)) as Date;
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toContain('2025-01-01');
  });

  it('should support encryption round-trip', async () => {
    const rawKey = new Uint8Array(32);
    rawKey.fill(0x42);
    const key = await importKey(rawKey);

    const value = { secret: 'data', count: 42 };
    const encrypted = await step.serialize(value, key);

    // Should be encrypted
    expect(isEncrypted(encrypted)).toBe(true);

    // Should decrypt and deserialize correctly
    const result = await step.deserialize(encrypted, key);
    expect(result).toEqual(value);
  });
});

// ---- Client mode ----

describe('client.serialize / client.deserialize', () => {
  it('should round-trip primitives', async () => {
    const serialized = await client.serialize(42);
    const result = await client.deserialize(serialized);
    expect(result).toBe(42);
  });

  it('should round-trip complex values', async () => {
    const value = { items: [1, 'two', new Date('2025-01-01')] };
    const serialized = await client.serialize(value);
    const result = (await client.deserialize(serialized)) as any;
    expect(result.items[0]).toBe(1);
    expect(result.items[1]).toBe('two');
    expect(result.items[2]).toBeInstanceOf(Date);
  });
});

// ---- Cross-mode compatibility ----

describe('cross-mode serialization', () => {
  it('workflow serialize → step deserialize', async () => {
    const value = { x: 42, date: new Date('2025-01-01') };
    const serialized = workflow.serialize(value);
    const result = (await step.deserialize(serialized)) as any;
    expect(result.x).toBe(42);
    expect(result.date).toBeInstanceOf(Date);
  });

  it('step serialize → workflow deserialize', async () => {
    const value = { y: 'hello', set: new Set([1, 2]) };
    const serialized = await step.serialize(value);
    const result = workflow.deserialize(serialized) as any;
    expect(result.y).toBe('hello');
    expect(result.set).toBeInstanceOf(Set);
  });

  it('client serialize → workflow deserialize', async () => {
    const value = [1, 'two', true];
    const serialized = await client.serialize(value);
    const result = workflow.deserialize(serialized);
    expect(result).toEqual(value);
  });
});
