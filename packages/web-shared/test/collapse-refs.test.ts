import { describe, expect, it } from 'vitest';
import { collapseRefs } from '../src/components/ui/data-inspector.js';

/**
 * `collapseRefs` normalizes non-JSON values into plain-JSON shapes so
 * react-json-view-lite can render them. AI agent stream chunks are commonly
 * hydrated as `Uint8Array` values either directly or nested in plain objects /
 * Map / Set (e.g. `{ delta: new Uint8Array(...) }`); these tests guard against
 * the typed-array decoding silently regressing.
 */

describe('collapseRefs typed-array handling', () => {
  it('decodes a top-level Uint8Array as UTF-8 text', () => {
    const chunk = new TextEncoder().encode('hello world');
    expect(collapseRefs(chunk)).toBe('hello world');
  });

  it('falls back to a compact summary for binary typed arrays', () => {
    const chunk = new Uint8Array([0xff, 0xfe, 0xfd]);
    expect(collapseRefs(chunk)).toBe('Uint8Array(3) [255, 254, 253]');
  });

  it('decodes typed arrays nested in plain objects', () => {
    const chunk = new TextEncoder().encode('AI says hi');
    const result = collapseRefs({ delta: chunk }) as Record<string, unknown>;
    expect(result.delta).toBe('AI says hi');
  });

  it('decodes typed arrays nested in arrays', () => {
    const chunk = new TextEncoder().encode('streamed');
    const result = collapseRefs([chunk]) as unknown[];
    expect(result[0]).toBe('streamed');
  });

  it('decodes typed arrays nested in Map values', () => {
    const chunk = new TextEncoder().encode('map value');
    const result = collapseRefs(new Map([['delta', chunk]])) as Record<
      string,
      unknown
    >;
    expect(result.delta).toBe('map value');
  });

  it('decodes typed arrays nested in Set entries', () => {
    const chunk = new TextEncoder().encode('set value');
    const result = collapseRefs(new Set([chunk])) as unknown[];
    expect(result[0]).toBe('set value');
  });

  it('handles non-Uint8Array typed array views', () => {
    const chunk = new Int16Array([-128, -1, -128]);
    const result = collapseRefs(chunk);
    expect(typeof result).toBe('string');
    expect(result as string).toMatch(/^Int16Array\(3\) \[/);
  });

  it('does not treat DataView as a bytes display target', () => {
    const buf = new Uint8Array([0x68, 0x69]).buffer;
    const view = new DataView(buf);
    expect(collapseRefs(view)).toBe(view);
  });

  it('passes primitives through unchanged', () => {
    expect(collapseRefs('plain text')).toBe('plain text');
    expect(collapseRefs(42)).toBe(42);
    expect(collapseRefs(null)).toBe(null);
    expect(collapseRefs(undefined)).toBe(undefined);
  });

  it('converts Date to ISO string', () => {
    const date = new Date('2024-01-15T12:00:00.000Z');
    expect(collapseRefs(date)).toBe('2024-01-15T12:00:00.000Z');
  });

  it('converts Map to plain object', () => {
    const result = collapseRefs(new Map([['key', 'value']]));
    expect(result).toEqual({ key: 'value' });
  });

  it('converts Set to array', () => {
    const result = collapseRefs(new Set(['a', 'b', 'c']));
    expect(result).toEqual(['a', 'b', 'c']);
  });
});
