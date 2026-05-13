import { describe, expect, it } from 'vitest';
import { bytesToUlid, ULID_BYTE_LENGTH, ulidToBytes } from './codec.js';
import {
  CURRENT_VERSION,
  decode,
  encode,
  isTagged,
  MAX_REGION_ID,
  MAX_VERSION,
  REGION_IDS,
  type RegionCode,
} from './index.js';

const SAMPLE_ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

describe('encode / decode round-trip', () => {
  it('encodes with default version=1 and the iad1 region code', () => {
    const tagged = encode(SAMPLE_ULID, 'iad1');
    expect(tagged).toHaveLength(26);
    expect(isTagged(tagged)).toBe(true);

    const decoded = decode(tagged);
    expect(decoded.tagged).toBe(true);
    expect(decoded.region).toBe('iad1');
    expect(decoded.regionId).toBe(REGION_IDS.iad1);
    expect(decoded.version).toBe(CURRENT_VERSION);
  });

  it('accepts numeric region IDs', () => {
    const tagged = encode(SAMPLE_ULID, 7);
    const decoded = decode(tagged);
    expect(decoded.regionId).toBe(7);
    expect(decoded.region).toBe('dub1');
  });

  it('returns region: null for unknown but in-range region IDs', () => {
    const tagged = encode(SAMPLE_ULID, 63);
    const decoded = decode(tagged);
    expect(decoded.regionId).toBe(63);
    expect(decoded.region).toBeNull();
  });

  it('encodes regionId=0 as the "unknown" sentinel', () => {
    const tagged = encode(SAMPLE_ULID, 0);
    const decoded = decode(tagged);
    expect(decoded.regionId).toBe(0);
    expect(decoded.region).toBeNull();
  });

  it('accepts an explicit version override', () => {
    const tagged = encode(SAMPLE_ULID, 'iad1', { version: 0 });
    expect(decode(tagged).version).toBe(0);

    const tagged2 = encode(SAMPLE_ULID, 'iad1', { version: MAX_VERSION });
    expect(decode(tagged2).version).toBe(MAX_VERSION);
  });

  it('preserves all metadata bits across encode → decode → encode', () => {
    for (const regionId of [0, 1, 17, 31, 32, 63]) {
      for (const version of [0, 1, 7, 16, 31]) {
        const tagged = encode(SAMPLE_ULID, regionId, { version });
        const decoded = decode(tagged);
        expect(decoded.regionId).toBe(regionId);
        expect(decoded.version).toBe(version);
        // Re-encoding the cleared ULID with the same metadata must reproduce
        // the same tagged string.
        const reTagged = encode(decoded.ulid, regionId, { version });
        expect(reTagged).toBe(tagged);
      }
    }
  });

  it('clears only the tag bit in the decoded ULID', () => {
    const tagged = encode(SAMPLE_ULID, 'fra1', { version: 5 });
    const decoded = decode(tagged);

    // The decoded ulid must NOT have the tag bit set.
    expect(isTagged(decoded.ulid)).toBe(false);

    // The metadata bits in bytes 14..15 must be preserved (not zeroed).
    const taggedBytes = ulidToBytes(tagged);
    const decodedBytes = ulidToBytes(decoded.ulid);
    expect(decodedBytes[14]).toBe(taggedBytes[14]);
    expect(decodedBytes[15]).toBe(taggedBytes[15]);

    // And byte[0] differs only in the top bit.
    expect(decodedBytes[0]).toBe(taggedBytes[0] & 0x7f);
  });

  it('overwrites the tag bit and metadata bits even if the input has them set', () => {
    // Synthesize a ULID with byte[0] tag bit pre-set and garbage in metadata.
    const bytes = new Uint8Array(ULID_BYTE_LENGTH);
    bytes[0] = 0x40; // some timestamp bits, tag bit NOT set yet
    bytes[14] = 0xff;
    bytes[15] = 0xff;
    const dirty = bytesToUlid(bytes);

    const tagged = encode(dirty, 'sfo1', { version: 3 });
    const decoded = decode(tagged);
    expect(decoded.region).toBe('sfo1');
    expect(decoded.regionId).toBe(REGION_IDS.sfo1);
    expect(decoded.version).toBe(3);
  });

  it('encode emits an uppercase result', () => {
    const tagged = encode(SAMPLE_ULID.toLowerCase(), 'iad1');
    expect(tagged).toBe(tagged.toUpperCase());
  });
});

describe('decode on un-tagged input', () => {
  it('returns tagged: false for a plain ULID', () => {
    const decoded = decode(SAMPLE_ULID);
    expect(decoded.tagged).toBe(false);
    // Decoded ulid equals input (already had tag bit cleared).
    expect(decoded.ulid).toBe(SAMPLE_ULID);
  });

  it('still extracts whatever bits are in the metadata positions', () => {
    // Plain ULID metadata bits are essentially random — just verify they
    // round-trip self-consistently.
    const decoded = decode(SAMPLE_ULID);
    expect(decoded.regionId).toBeGreaterThanOrEqual(0);
    expect(decoded.regionId).toBeLessThanOrEqual(MAX_REGION_ID);
    expect(decoded.version).toBeGreaterThanOrEqual(0);
    expect(decoded.version).toBeLessThanOrEqual(MAX_VERSION);
  });
});

describe('encode validation', () => {
  it('rejects invalid ULID input', () => {
    expect(() => encode('not-a-ulid', 'iad1')).toThrow();
    expect(() => encode('', 'iad1')).toThrow(/Invalid ULID length/);
    expect(() => encode(SAMPLE_ULID.slice(1), 'iad1')).toThrow(
      /Invalid ULID length/
    );
  });

  it('rejects unknown region codes', () => {
    expect(() => encode(SAMPLE_ULID, 'xxx1' as RegionCode)).toThrow(
      /Unknown region/
    );
  });

  it('rejects out-of-range numeric regions', () => {
    expect(() => encode(SAMPLE_ULID, -1)).toThrow(RangeError);
    expect(() => encode(SAMPLE_ULID, 64)).toThrow(RangeError);
    expect(() => encode(SAMPLE_ULID, 1.5)).toThrow(RangeError);
    expect(() => encode(SAMPLE_ULID, Number.NaN)).toThrow(RangeError);
  });

  it('rejects out-of-range versions', () => {
    expect(() => encode(SAMPLE_ULID, 'iad1', { version: -1 })).toThrow(
      RangeError
    );
    expect(() => encode(SAMPLE_ULID, 'iad1', { version: 32 })).toThrow(
      RangeError
    );
    expect(() => encode(SAMPLE_ULID, 'iad1', { version: 1.5 })).toThrow(
      RangeError
    );
  });
});

describe('region table coverage', () => {
  it('covers all 21 known Vercel compute regions plus hel1/zrh1 + unknown', () => {
    const expected: RegionCode[] = [
      'unknown',
      'iad1',
      'sfo1',
      'pdx1',
      'cle1',
      'yul1',
      'gru1',
      'dub1',
      'lhr1',
      'cdg1',
      'fra1',
      'bru1',
      'arn1',
      'hel1',
      'zrh1',
      'cpt1',
      'dxb1',
      'bom1',
      'sin1',
      'hkg1',
      'hnd1',
      'icn1',
      'kix1',
      'syd1',
    ];
    expect(Object.keys(REGION_IDS).sort()).toEqual([...expected].sort());
  });

  it('assigns each region a unique ID in [0, 63]', () => {
    const ids = Object.values(REGION_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThanOrEqual(MAX_REGION_ID);
    }
  });

  it('all known region codes round-trip through encode/decode', () => {
    for (const code of Object.keys(REGION_IDS) as RegionCode[]) {
      if (code === 'unknown') continue; // encode by name would resolve to 0 → region: null
      const tagged = encode(SAMPLE_ULID, code);
      const decoded = decode(tagged);
      expect(decoded.region).toBe(code);
      expect(decoded.regionId).toBe(REGION_IDS[code]);
    }
  });
});

describe('lexicographic order', () => {
  it('all tagged ULIDs sort above all untagged ULIDs', () => {
    // Tag bit on byte[0] sets the first char to ≥ '4'. Plain ULIDs that
    // haven't blown past year 2248 start with '0' or '1'. Pick a max-plain
    // ULID and a min-tagged ULID and confirm ordering.
    const minTagged = encode('0'.repeat(26), 0, { version: 0 });
    expect(minTagged > '3'.repeat(26)).toBe(true);
  });

  it('two tagged ULIDs with the same metadata preserve input ordering when they differ above the metadata bits', () => {
    // Pick two ULIDs differing in the timestamp (char[5]). The metadata bits
    // (bottom 11 bits) get normalized to the same values, but earlier bits
    // — including timestamp — are preserved verbatim apart from the tag bit.
    const a = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const b = '01ARZ3NDEMTSV4RRFFQ69G5FAV';
    expect(a < b).toBe(true);
    const ta = encode(a, 'iad1');
    const tb = encode(b, 'iad1');
    expect(ta < tb).toBe(true);
  });
});
