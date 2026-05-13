import { describe, expect, it } from 'vitest';
import {
  bytesToUlid,
  isTaggedString,
  TAG_BIT_MASK,
  ULID_BYTE_LENGTH,
  ULID_LENGTH,
  ulidToBytes,
} from './codec.js';

/**
 * Reference ULID with all bytes = 0. Crockford encoding of 16 zero bytes is
 * 26 '0' chars.
 */
const ZERO_ULID = '0'.repeat(ULID_LENGTH);

/**
 * Reference ULID with all bytes = 0xff. Crockford encoding of 16 0xff bytes
 * is the 26-char value "7ZZZZZZZZZZZZZZZZZZZZZZZZZ" (the top char carries
 * only 3 real bits, so its max is 7).
 */
const MAX_ULID = '7ZZZZZZZZZZZZZZZZZZZZZZZZZ';

describe('codec / ulidToBytes & bytesToUlid', () => {
  it('round-trips the all-zero ULID', () => {
    const bytes = ulidToBytes(ZERO_ULID);
    expect(bytes).toEqual(new Uint8Array(ULID_BYTE_LENGTH));
    expect(bytesToUlid(bytes)).toBe(ZERO_ULID);
  });

  it('round-trips the all-ones ULID', () => {
    const bytes = ulidToBytes(MAX_ULID);
    expect(bytes).toEqual(new Uint8Array(ULID_BYTE_LENGTH).fill(0xff));
    expect(bytesToUlid(bytes)).toBe(MAX_ULID);
  });

  it('round-trips a typical ULID-shaped value', () => {
    const ulid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const bytes = ulidToBytes(ulid);
    expect(bytes).toHaveLength(ULID_BYTE_LENGTH);
    expect(bytesToUlid(bytes)).toBe(ulid);
  });

  it('decodes lowercase Crockford characters and emits uppercase', () => {
    const ulid = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    expect(bytesToUlid(ulidToBytes(ulid.toLowerCase()))).toBe(ulid);
  });

  it('rejects strings of the wrong length', () => {
    expect(() => ulidToBytes('')).toThrow(/Invalid ULID length/);
    expect(() => ulidToBytes('0'.repeat(25))).toThrow(/Invalid ULID length/);
    expect(() => ulidToBytes('0'.repeat(27))).toThrow(/Invalid ULID length/);
  });

  it('rejects strings with invalid Crockford characters', () => {
    // 'U' is invalid in Crockford Base32.
    const bad = `U${ZERO_ULID.slice(1)}`;
    expect(() => ulidToBytes(bad)).toThrow(
      /Invalid Crockford-Base32 character/
    );
    // 'L' is also invalid in Crockford (replaced by '1').
    const bad2 = `L${ZERO_ULID.slice(1)}`;
    expect(() => ulidToBytes(bad2)).toThrow(
      /Invalid Crockford-Base32 character/
    );
    // Non-ASCII.
    const bad3 = `\u00ff${ZERO_ULID.slice(1)}`;
    expect(() => ulidToBytes(bad3)).toThrow(
      /Invalid Crockford-Base32 character/
    );
  });

  it("rejects ULIDs whose first character is > '7'", () => {
    // '8' = 0b01000, which has the top of its 3 real bits set... wait, '8'
    // has value 8 = 0b01000 in Crockford. The codec checks the top 2 pad
    // bits (values[0] & 0x18). 8 & 0x18 = 0x08, which is nonzero.
    const bad = `8${'0'.repeat(25)}`;
    expect(() => ulidToBytes(bad)).toThrow(/top 2 bits must be zero/);
    // 'Z' = 31 = 0b11111 → top 2 pad bits both set.
    const bad2 = `Z${'0'.repeat(25)}`;
    expect(() => ulidToBytes(bad2)).toThrow(/top 2 bits must be zero/);
  });

  it('throws on non-string inputs', () => {
    expect(() => ulidToBytes(undefined as unknown as string)).toThrow(
      TypeError
    );
    expect(() => ulidToBytes(null as unknown as string)).toThrow(TypeError);
    expect(() => ulidToBytes(123 as unknown as string)).toThrow(TypeError);
  });

  it('rejects wrong-length byte arrays', () => {
    expect(() => bytesToUlid(new Uint8Array(15))).toThrow(
      /Invalid byte length/
    );
    expect(() => bytesToUlid(new Uint8Array(17))).toThrow(
      /Invalid byte length/
    );
  });
});

describe('codec / isTaggedString', () => {
  it('returns false for the zero ULID', () => {
    expect(isTaggedString(ZERO_ULID)).toBe(false);
  });

  it('returns true for a ULID with the tag bit manually set', () => {
    const bytes = new Uint8Array(ULID_BYTE_LENGTH);
    bytes[0] = TAG_BIT_MASK;
    const tagged = bytesToUlid(bytes);
    expect(isTaggedString(tagged)).toBe(true);
    // First char of a value with byte[0] = 0x80 should be '4' (0b100).
    expect(tagged[0]).toBe('4');
  });

  it('returns false for non-strings, wrong lengths, and invalid chars', () => {
    expect(isTaggedString('')).toBe(false);
    expect(isTaggedString('0'.repeat(25))).toBe(false);
    expect(isTaggedString(null as unknown as string)).toBe(false);
    expect(isTaggedString(undefined as unknown as string)).toBe(false);
    expect(isTaggedString(`U${ZERO_ULID.slice(1)}`)).toBe(false);
  });
});
