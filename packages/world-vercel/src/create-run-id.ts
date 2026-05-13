import { monotonicFactory } from 'ulid';
import { bytesToUlid, ulidToBytes } from './run-id/codec.js';
import { encode } from './run-id/index.js';
import { REGION_IDS, type RegionCode } from './run-id/regions.js';

/**
 * Underlying monotonic ULID factory. We post-process its output through
 * {@link encode}, which overwrites the bottom 11 bits of randomness — so
 * within the same millisecond, the monotonic factory's bottom-bit
 * increments would be destroyed if we relied on them naïvely. We layer
 * our own per-process monotonicity check on top (see {@link createRunId}).
 */
const ulid = monotonicFactory();

/**
 * Last emitted run ID (the encoded/tagged form), used to enforce strict
 * lexicographic monotonicity across calls within a single process even
 * when many IDs are minted in the same millisecond.
 */
let lastRunId: string | undefined;

/**
 * Add `1 << 11` to the integer value of a 26-char tagged ULID — i.e.
 * increment the bit immediately above the 11-bit metadata window. This
 * lets us produce a strictly-larger ULID without disturbing the
 * region/version metadata that lives in the bottom 11 bits.
 *
 * Throws if the ULID is at its maximum value (timestamp would overflow).
 */
function bumpAboveMetadata(ulidStr: string): string {
  const bytes = ulidToBytes(ulidStr);
  // 11-bit metadata occupies the low 3 bits of bytes[14] + all of bytes[15].
  // The next bit above is bit 3 of bytes[14]; adding 1 << 3 = 8 to bytes[14]
  // and propagating the carry upward gives us the desired increment.
  let i = 14;
  let carry = 0x08;
  while (i >= 0 && carry > 0) {
    const sum = bytes[i] + carry;
    bytes[i] = sum & 0xff;
    carry = sum >> 8;
    i--;
  }
  if (carry > 0) {
    // 128-bit ULID space exhausted — astronomically unlikely.
    throw new Error('ULID space exhausted');
  }
  return bytesToUlid(bytes);
}

/**
 * Coerce an arbitrary value into a known {@link RegionCode}, returning
 * `null` for anything that isn't a string matching a real region entry in
 * {@link REGION_IDS} (the `'unknown'` sentinel is explicitly excluded so
 * callers can't accidentally supply it).
 */
function coerceRegion(value: unknown): RegionCode | null {
  if (typeof value !== 'string' || value === '' || value === 'unknown') {
    return null;
  }
  return Object.hasOwn(REGION_IDS, value) ? (value as RegionCode) : null;
}

/**
 * Resolve the effective region for a run, preferring an explicit value
 * supplied via the `input` hint over the `VERCEL_REGION` environment
 * variable. Returns `null` when neither source yields a recognised region,
 * in which case the run ID falls back to the `unknown` (0) region tag.
 */
function resolveRegion(
  input: Record<string, unknown> | undefined
): RegionCode | null {
  return coerceRegion(input?.region) ?? coerceRegion(process.env.VERCEL_REGION);
}

/**
 * Options recognised by world-vercel's {@link createRunId}.
 *
 * Forwarded by `start()` via its `runIdInput` option; any keys not listed
 * here are ignored.
 */
export interface CreateRunIdInput {
  /**
   * Override the Vercel region to embed in the run ID. When omitted, falls
   * back to the `VERCEL_REGION` environment variable, and then to the
   * `unknown` (0) region sentinel.
   */
  region?: RegionCode;
}

/**
 * `World.createRunId` implementation that mints region-tagged ULIDs.
 *
 * Region resolution order (first non-empty wins):
 *   1. `input.region` — explicit caller-supplied region from
 *      `start({ runIdInput: { region } })`.
 *   2. `process.env.VERCEL_REGION` — the region the current Vercel function
 *      is executing in.
 *   3. Region ID 0 (`unknown`) — the resulting ULID is still tagged but
 *      does not claim a specific region.
 *
 * Monotonicity: because `encode` overwrites the bottom 11 bits of the
 * ULID's randomness with region/version metadata, the underlying ULID
 * factory's monotonic bottom-bit increments are destroyed within a single
 * millisecond. We layer our own monotonicity guarantee on top by tracking
 * the last emitted ID and bumping the candidate lexicographically until
 * it is strictly greater.
 */
export function createRunId(input?: Record<string, unknown>): string {
  const region = resolveRegion(input);
  const regionId = region == null ? REGION_IDS.unknown : REGION_IDS[region];
  let candidate = encode(ulid(), regionId);
  // Same-ms calls share a timestamp and the underlying monotonic factory's
  // bottom-bit increments fall inside the metadata window, so the freshly
  // encoded `candidate` may be `<=` the previous emission for the same
  // region (or smaller still when the previous emission belonged to a
  // higher-numbered region). Bump the candidate above the metadata bits
  // until it strictly exceeds `lastRunId`, then re-stamp the requested
  // region/version on top to keep metadata stable.
  if (lastRunId !== undefined) {
    while (candidate <= lastRunId) {
      candidate = encode(bumpAboveMetadata(lastRunId), regionId);
    }
  }
  lastRunId = candidate;
  return candidate;
}
