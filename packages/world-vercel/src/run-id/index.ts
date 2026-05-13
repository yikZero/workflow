/**
 * Region-tagged ULID encoding for Vercel workflow run IDs.
 *
 * A "tagged" run ID is a regular 26-character Crockford-Base32 ULID with:
 *
 *   - **Tag bit**: the MSB of byte 0 (the most-significant bit of the 48-bit
 *     timestamp) is set to 1, distinguishing this scheme from a plain ULID.
 *     This shifts the first character into the range `4`..`7`.
 *   - **Version** (5 bits, 0–31): encoded into the bottom 11 bits of the
 *     80-bit randomness section (specifically: high 3 bits of `version` go
 *     into the low 3 bits of byte 14, low 2 bits of `version` go into the
 *     high 2 bits of byte 15).
 *   - **Region ID** (6 bits, 0–63): encoded into the bottom 6 bits of byte 15.
 *     Region IDs are assigned in {@link REGION_IDS}.
 *
 * Net effect: 80 bits of ULID randomness become 69 bits (still ~5.9 × 10²⁰
 * distinct values per millisecond), and the maximum representable timestamp
 * drops from year ~10895 down to year ~5429 — neither limit is practically
 * relevant.
 *
 * Tagged ULIDs remain valid ULIDs (lexicographically sortable, monotonic when
 * generated with a monotonic factory), so they can flow through any system
 * that accepts ULIDs.
 *
 * @example
 * ```ts
 * import { monotonicFactory } from 'ulid';
 * import { encode, decode } from '@workflow/world-vercel/run-id';
 *
 * const ulid = monotonicFactory();
 * const taggedRunId = encode(ulid(), 'iad1');
 *
 * const { region, regionId, version } = decode(taggedRunId);
 * // region === 'iad1', regionId === 1, version === 1, tagged === true
 * ```
 *
 * @packageDocumentation
 */

import {
  bytesToUlid,
  isTaggedString,
  MAX_REGION,
  MAX_VERSION,
  REGION_MASK,
  TAG_BIT_MASK,
  ulidToBytes,
  VERSION_HIGH_MASK,
  VERSION_LOW_MASK,
} from './codec.js';
import { lookupRegion, REGION_IDS, type RegionCode } from './regions.js';

export {
  lookupRegion,
  REGION_IDS,
  type RegionCode,
  type RegionId,
  type RegionKey,
  regionIdFor,
} from './regions.js';

/** Encoding format version currently emitted by {@link encode}. */
export const CURRENT_VERSION = 1;

export interface EncodeOptions {
  /**
   * Encoding format version to embed. Must be in the range 0..31. Defaults to
   * {@link CURRENT_VERSION} (1). Version 0 is reserved as a sentinel meaning
   * "no metadata encoded" — callers should not normally emit it.
   */
  version?: number;
}

export interface DecodedRunId {
  /**
   * Whether the input had the tag bit set. If `false`, the {@link regionId}
   * and {@link version} fields will still be populated by reading the same
   * bit positions, but callers should generally ignore them as they will be
   * meaningless for un-tagged ULIDs.
   */
  tagged: boolean;
  /**
   * The input ULID with **only the tag bit cleared**. The 11 encoded bits in
   * bytes 14–15 are preserved verbatim. For un-tagged input this equals the
   * input string (uppercased).
   */
  ulid: string;
  /** Encoded format version (0..31). */
  version: number;
  /** Encoded region ID (0..63). 0 represents "unknown". */
  regionId: number;
  /**
   * Region code (e.g. `'iad1'`) when {@link regionId} matches a known entry
   * in {@link REGION_IDS}, else `null`.
   */
  region: RegionCode | null;
}

function isRegionCode(value: unknown): value is RegionCode {
  return (
    typeof value === 'string' &&
    value !== 'unknown' &&
    Object.hasOwn(REGION_IDS, value)
  );
}

/**
 * Encode a region ID and version into a ULID, producing a 26-character
 * "tagged" ULID. The input ULID's bottom 11 randomness bits and top
 * (timestamp MSB) bit are overwritten.
 *
 * @param ulid - A valid 26-character Crockford-Base32 ULID.
 * @param region - Either a numeric region ID (0..63) or a known
 *   {@link RegionCode} (e.g. `'iad1'`).
 * @param options - See {@link EncodeOptions}.
 * @returns The tagged ULID, always uppercase.
 *
 * @throws If `ulid` is not a valid ULID string, if `region` is an unknown
 *   region code, if a numeric `region` is outside 0..63, or if
 *   `options.version` is outside 0..31.
 */
export function encode(
  ulid: string,
  region: number | RegionCode,
  options: EncodeOptions = {}
): string {
  // Resolve region → numeric ID.
  let regionId: number;
  if (typeof region === 'number') {
    if (!Number.isInteger(region) || region < 0 || region > MAX_REGION) {
      throw new RangeError(
        `regionId must be an integer in [0, ${MAX_REGION}]; got ${region}`
      );
    }
    regionId = region;
  } else if (isRegionCode(region)) {
    regionId = REGION_IDS[region];
  } else {
    throw new Error(`Unknown region: ${String(region)}`);
  }

  const version = options.version ?? CURRENT_VERSION;
  if (!Number.isInteger(version) || version < 0 || version > MAX_VERSION) {
    throw new RangeError(
      `version must be an integer in [0, ${MAX_VERSION}]; got ${version}`
    );
  }

  const bytes = ulidToBytes(ulid);

  // Set the tag bit.
  bytes[0] = bytes[0] | TAG_BIT_MASK;

  // Pack version (5 bits): high 3 bits → byte[14] low 3 bits;
  //                       low 2 bits  → byte[15] high 2 bits.
  const versionHigh = (version >> 2) & VERSION_HIGH_MASK; // 3 bits
  const versionLow = (version & 0x03) << 6; // 2 bits placed at bits 6..7

  bytes[14] = (bytes[14] & ~VERSION_HIGH_MASK) | versionHigh;
  bytes[15] =
    (bytes[15] & ~(VERSION_LOW_MASK | REGION_MASK)) |
    versionLow |
    (regionId & REGION_MASK);

  return bytesToUlid(bytes);
}

/**
 * Decode a (possibly) tagged ULID. Always succeeds for any syntactically
 * valid ULID; check {@link DecodedRunId.tagged} to determine whether the
 * input was actually tagged by this scheme.
 *
 * The returned {@link DecodedRunId.ulid} has only the tag bit cleared — the
 * 11 metadata bits remain in place, so `decode(encode(u, r)).ulid` is *not*
 * byte-identical to `u` (the bottom 11 randomness bits of `u` were destroyed
 * by `encode`), but `decode(encode(u, r)).ulid` is byte-identical to
 * `decode(encode(decode(encode(u, r)).ulid, r)).ulid`.
 *
 * @throws If the input is not a syntactically valid 26-character
 *   Crockford-Base32 ULID.
 */
export function decode(taggedUlid: string): DecodedRunId {
  const bytes = ulidToBytes(taggedUlid);
  const tagged = (bytes[0] & TAG_BIT_MASK) !== 0;

  const regionId = bytes[15] & REGION_MASK;
  const version =
    ((bytes[14] & VERSION_HIGH_MASK) << 2) |
    ((bytes[15] & VERSION_LOW_MASK) >> 6);

  // Clear the tag bit for the returned "untagged" ULID.
  bytes[0] = bytes[0] & ~TAG_BIT_MASK;
  const ulid = bytesToUlid(bytes);

  return {
    tagged,
    ulid,
    version,
    regionId,
    region: lookupRegion(regionId),
  };
}

/**
 * Returns `true` if `value` is a 26-character Crockford-Base32 ULID with the
 * tag bit set (i.e. was produced by {@link encode}). Returns `false` for any
 * input that is not a syntactically valid ULID, including non-strings.
 *
 * The parameter is typed as `unknown` so this function can safely be used as
 * a guard on untrusted input without requiring callers to cast.
 */
export function isTagged(value: unknown): boolean {
  return isTaggedString(value);
}

// Re-export internal constants that may be useful for callers wanting to
// reason about the encoding's bit budget without importing from a deep path.
export { MAX_REGION as MAX_REGION_ID, MAX_VERSION } from './codec.js';
