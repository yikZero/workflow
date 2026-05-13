import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRunId } from './create-run-id.js';
import { decode } from './run-id/index.js';
import { REGION_IDS } from './run-id/regions.js';

describe('createRunId', () => {
  const originalRegion = process.env.VERCEL_REGION;

  afterEach(() => {
    if (originalRegion === undefined) delete process.env.VERCEL_REGION;
    else process.env.VERCEL_REGION = originalRegion;
  });

  describe('when VERCEL_REGION is a known region', () => {
    beforeEach(() => {
      process.env.VERCEL_REGION = 'iad1';
    });

    it('returns a 26-character tagged ULID', () => {
      const id = createRunId();
      expect(id).toHaveLength(26);
      const decoded = decode(id);
      expect(decoded.tagged).toBe(true);
    });

    it('embeds the resolved region ID and current version', () => {
      const id = createRunId();
      const decoded = decode(id);
      expect(decoded.regionId).toBe(REGION_IDS.iad1);
      expect(decoded.region).toBe('iad1');
      expect(decoded.version).toBe(1);
    });

    it('is monotonically increasing within a process', () => {
      const ids = Array.from({ length: 16 }, () => createRunId());
      const sorted = [...ids].sort();
      expect(sorted).toEqual(ids);
      // And all unique.
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('remains monotonic even when 2048+ IDs are minted in the same ms', () => {
      // 2^11 = 2048: enough calls to roll the entire 11-bit metadata
      // window over and exercise the fallback-bump path in createRunId.
      const ids = Array.from({ length: 4096 }, () => createRunId());
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i] > ids[i - 1]).toBe(true);
      }
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('reflects later updates to process.env.VERCEL_REGION', () => {
      const iad = createRunId();
      expect(decode(iad).region).toBe('iad1');
      process.env.VERCEL_REGION = 'fra1';
      const fra = createRunId();
      expect(decode(fra).region).toBe('fra1');
    });
  });

  describe('when VERCEL_REGION is missing or unrecognised', () => {
    it('falls back to the "unknown" region (id 0) when unset', () => {
      delete process.env.VERCEL_REGION;
      const decoded = decode(createRunId());
      expect(decoded.tagged).toBe(true);
      expect(decoded.regionId).toBe(0);
      expect(decoded.region).toBeNull();
    });

    it('falls back to "unknown" when the env var is empty', () => {
      process.env.VERCEL_REGION = '';
      const decoded = decode(createRunId());
      expect(decoded.regionId).toBe(0);
    });

    it('falls back to "unknown" for an unrecognised region code', () => {
      process.env.VERCEL_REGION = 'xyz9';
      const decoded = decode(createRunId());
      expect(decoded.regionId).toBe(0);
    });

    it('does not treat the literal string "unknown" as a region', () => {
      // Defensive: the REGION_IDS table contains an `unknown` key but it is
      // a sentinel, not an actual region name. The env var should not be
      // matched against it.
      process.env.VERCEL_REGION = 'unknown';
      const decoded = decode(createRunId());
      expect(decoded.regionId).toBe(0);
      expect(decoded.region).toBeNull();
    });
  });

  describe('with an explicit `input.region`', () => {
    it('prefers an explicit region over VERCEL_REGION', () => {
      process.env.VERCEL_REGION = 'iad1';
      const decoded = decode(createRunId({ region: 'fra1' }));
      expect(decoded.region).toBe('fra1');
      expect(decoded.regionId).toBe(REGION_IDS.fra1);
    });

    it('still falls back to VERCEL_REGION when input.region is missing', () => {
      process.env.VERCEL_REGION = 'sfo1';
      const decoded = decode(createRunId({}));
      expect(decoded.region).toBe('sfo1');
    });

    it('falls back to VERCEL_REGION when input.region is an unrecognised string', () => {
      process.env.VERCEL_REGION = 'sfo1';
      const decoded = decode(createRunId({ region: 'xyz9' }));
      expect(decoded.region).toBe('sfo1');
    });

    it('falls back to VERCEL_REGION when input.region is the empty string', () => {
      process.env.VERCEL_REGION = 'sfo1';
      const decoded = decode(createRunId({ region: '' }));
      expect(decoded.region).toBe('sfo1');
    });

    it('ignores non-string region hints (no throw, fall back)', () => {
      process.env.VERCEL_REGION = 'sfo1';
      const decoded = decode(
        createRunId({ region: 42 as unknown as undefined })
      );
      expect(decoded.region).toBe('sfo1');
    });

    it('ignores unrelated keys in the input bag', () => {
      process.env.VERCEL_REGION = 'iad1';
      const decoded = decode(createRunId({ unrelated: 'value' }));
      expect(decoded.region).toBe('iad1');
    });

    it('accepts an undefined input (matching the World.createRunId signature)', () => {
      process.env.VERCEL_REGION = 'iad1';
      const decoded = decode(createRunId(undefined));
      expect(decoded.region).toBe('iad1');
    });
  });
});
