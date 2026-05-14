import { describe, expect, it } from 'vitest';
import { formatDuration } from '../src/lib/utils.js';

/**
 * The `precise` option on `formatDuration` is used in the new trace viewer
 * for span durations, timeline hover labels, and detail-pane offsets. It
 * must never round up to the next-larger unit — a 1500ms span should never
 * render as `2s`.
 */
describe('formatDuration with { precise: true }', () => {
  const precise = (ms: number) => formatDuration(ms, { precise: true });

  it('renders zero', () => {
    expect(precise(0)).toBe('0s');
  });

  it('renders sub-second values as integer milliseconds', () => {
    expect(precise(1)).toBe('1ms');
    expect(precise(380)).toBe('380ms');
    expect(precise(999)).toBe('999ms');
    expect(precise(999.4)).toBe('999ms');
  });

  it('renders sub-minute values with up to two decimals of seconds', () => {
    expect(precise(1000)).toBe('1s');
    expect(precise(1500)).toBe('1.5s');
    expect(precise(1530)).toBe('1.53s');
    expect(precise(8500)).toBe('8.5s');
    expect(precise(12340)).toBe('12.34s');
    expect(precise(59990)).toBe('59.99s');
  });

  it('never rounds up to the next-larger unit', () => {
    expect(precise(1500)).not.toBe('2s');
    expect(precise(8500)).not.toBe('9s');
    expect(precise(59999)).not.toBe('1m');
  });

  it('truncates at unit boundaries instead of overflowing', () => {
    // 999.5ms must stay in the ms bucket — `Math.round` would emit "1000ms".
    expect(precise(999.5)).toBe('999ms');
    // 59.999s must stay in the seconds bucket — `toFixed(2)` would emit "60s".
    expect(precise(59_999)).toBe('59.99s');
    // 1m 59.95s must not roll over to "1m 60s" via `toFixed(1)`.
    expect(precise(119_950)).toBe('1m 59.9s');
  });

  it('renders sub-hour values as minutes + decimal seconds', () => {
    expect(precise(60_000)).toBe('1m');
    expect(precise(65_000)).toBe('1m 5s');
    expect(precise(65_200)).toBe('1m 5.2s');
    expect(precise(125_500)).toBe('2m 5.5s');
  });

  it('renders longer durations as hour/day decomposition', () => {
    expect(precise(3_600_000)).toBe('1h');
    expect(precise(3_660_000)).toBe('1h 1m');
    expect(precise(3_665_000)).toBe('1h 1m 5s');
    expect(precise(90_061_000)).toBe('1d 1h 1m 1s');
  });
});

/**
 * Guard the pre-existing default and compact behaviors of `formatDuration`
 * — the precise refactor must not change them, and the legacy two-arg
 * `formatDuration(ms, true)` form is still in use across the codebase.
 */
describe('formatDuration default + compact (unchanged behavior)', () => {
  it('preserves the legacy boolean compact shorthand', () => {
    expect(formatDuration(125_000, true)).toBe('2m 5s');
    expect(formatDuration(125_000, { compact: true })).toBe('2m 5s');
  });

  it('still rounds seconds in the default and compact modes', () => {
    expect(formatDuration(1500)).toBe('2s');
    expect(formatDuration(1500, true)).toBe('2s');
  });

  it('renders the long form when no options are passed', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(380)).toBe('380ms');
    expect(formatDuration(73_000)).toBe('1m 13s');
  });
});
