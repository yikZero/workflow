/**
 * Tests for the VM-compatible workflow serializer.
 *
 * Verifies that:
 * 1. The VM serializer produces the same wire format as the Node.js serializer
 * 2. Data serialized by the VM can be deserialized by Node.js and vice versa
 * 3. The pure-JS base64 implementation is correct
 */

import { describe, it, expect } from 'vitest';
import { base64Decode, base64Encode } from './base64.js';
import {
  serialize as vmSerialize,
  deserialize as vmDeserialize,
} from './workflow-vm.js';
import {
  serialize as nodeSerialize,
  deserialize as nodeDeserialize,
} from './workflow.js';
import { peekFormatPrefix } from './format.js';

describe('base64 encode/decode', () => {
  it('should round-trip empty buffer', () => {
    const encoded = base64Encode(new Uint8Array(0));
    expect(encoded).toBe('');
    const decoded = base64Decode(encoded);
    expect(decoded.length).toBe(0);
  });

  it('should round-trip small buffers', () => {
    for (const bytes of [
      new Uint8Array([0]),
      new Uint8Array([1, 2, 3]),
      new Uint8Array([255]),
      new Uint8Array([0, 0, 0]),
    ]) {
      const encoded = base64Encode(bytes);
      const decoded = base64Decode(encoded);
      expect(Array.from(decoded)).toEqual(Array.from(bytes));
    }
  });

  it('should match Node.js Buffer base64', () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const jsBase64 = base64Encode(data);
    const nodeBase64 = Buffer.from(data).toString('base64');
    expect(jsBase64).toBe(nodeBase64);
  });

  it('should decode Node.js Buffer base64', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const nodeBase64 = Buffer.from(data).toString('base64');
    const decoded = base64Decode(nodeBase64);
    expect(Array.from(decoded)).toEqual(Array.from(data));
  });
});

describe('VM workflow serializer', () => {
  it('should produce format-prefixed output', () => {
    const serialized = vmSerialize(42);
    expect(serialized).toBeInstanceOf(Uint8Array);
    expect(peekFormatPrefix(serialized)).toBe('devl');
  });

  it('should round-trip primitives', () => {
    for (const val of [42, 'hello', true, null, undefined]) {
      expect(vmDeserialize(vmSerialize(val))).toEqual(val);
    }
  });

  it('should round-trip Date', () => {
    const date = new Date('2025-01-01T00:00:00Z');
    const result = vmDeserialize(vmSerialize(date)) as Date;
    expect(result).toBeInstanceOf(Date);
    expect(result.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  it('should round-trip Map', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const result = vmDeserialize(vmSerialize(map)) as Map<string, number>;
    expect(result).toBeInstanceOf(Map);
    expect(result.get('a')).toBe(1);
  });

  it('should round-trip Uint8Array', () => {
    const u8 = new Uint8Array([1, 2, 3, 4, 5]);
    const result = vmDeserialize(vmSerialize(u8)) as Uint8Array;
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should round-trip nested objects', () => {
    const val = { a: 1, b: [2, new Date('2025-01-01')], c: { d: 'e' } };
    const result = vmDeserialize(vmSerialize(val)) as any;
    expect(result.a).toBe(1);
    expect(result.b[0]).toBe(2);
    expect(result.b[1]).toBeInstanceOf(Date);
    expect(result.c.d).toBe('e');
  });
});

describe('VM ↔ Node.js cross-compatibility', () => {
  it('VM serialize → Node.js deserialize', () => {
    const values = [
      42,
      'hello',
      new Date('2025-06-15'),
      new Map([['x', 1]]),
      new Set([1, 2, 3]),
      new Uint8Array([10, 20, 30]),
      { nested: { arr: [1, 2, 3] } },
    ];
    for (const val of values) {
      const vmBytes = vmSerialize(val);
      const nodeResult = nodeDeserialize(vmBytes);
      const vmResult = vmDeserialize(vmBytes);
      // Both should produce equivalent values
      expect(JSON.stringify(nodeResult)).toBe(JSON.stringify(vmResult));
    }
  });

  it('Node.js serialize → VM deserialize', () => {
    const values = [
      42,
      'hello',
      new Date('2025-06-15'),
      new Map([['x', 1]]),
      new Set([1, 2, 3]),
      new Uint8Array([10, 20, 30]),
      { nested: { arr: [1, 2, 3] } },
    ];
    for (const val of values) {
      const nodeBytes = nodeSerialize(val);
      const vmResult = vmDeserialize(nodeBytes);
      const nodeResult = nodeDeserialize(nodeBytes);
      expect(JSON.stringify(vmResult)).toBe(JSON.stringify(nodeResult));
    }
  });

  it('step args format: VM serialize → Node.js hydrateStepArguments', async () => {
    // This is the critical path: VM serializes step args, step handler deserializes
    const { hydrateStepArguments } = await import('../serialization.js');

    const stepInput = { args: [10, 7], closureVars: { x: 42 } };
    const vmBytes = vmSerialize(stepInput);

    const hydrated = (await hydrateStepArguments(
      vmBytes,
      'run-123',
      undefined
    )) as any;
    expect(hydrated.args).toEqual([10, 7]);
    expect(hydrated.closureVars).toEqual({ x: 42 });
  });

  it('step result format: Node.js dehydrateStepReturnValue → VM deserialize', async () => {
    // This is the other critical path: step handler serializes result, VM deserializes
    const { dehydrateStepReturnValue } = await import('../serialization.js');

    const result = { sum: 17, computed: true };
    const nodeBytes = await dehydrateStepReturnValue(
      result,
      'run-123',
      undefined,
      []
    );
    const vmResult = vmDeserialize(nodeBytes) as any;
    expect(vmResult.sum).toBe(17);
    expect(vmResult.computed).toBe(true);
  });
});
