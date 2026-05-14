import { describe, expect, it } from 'vitest';
import { formatDurationPrecise } from '../src/lib/utils.js';

/**
 * `formatDurationPrecise` is used in the new trace viewer for span durations,
 * timeline hover labels, and detail-pane offsets. Unlike `formatDuration`, it
 * must never round up to the next-larger unit — a 1500ms span should never
 * render as `2s`.
 */
describe('formatDurationPrecise', () => {
  it('renders zero', () => {
    expect(formatDurationPrecise(0)).toBe('0s');
  });

  it('renders sub-second values as integer milliseconds', () => {
    expect(formatDurationPrecise(1)).toBe('1ms');
    expect(formatDurationPrecise(380)).toBe('380ms');
    expect(formatDurationPrecise(999)).toBe('999ms');
    expect(formatDurationPrecise(999.4)).toBe('999ms');
  });

  it('renders sub-minute values with up to two decimals of seconds', () => {
    expect(formatDurationPrecise(1000)).toBe('1s');
    expect(formatDurationPrecise(1500)).toBe('1.5s');
    expect(formatDurationPrecise(1530)).toBe('1.53s');
    expect(formatDurationPrecise(8500)).toBe('8.5s');
    expect(formatDurationPrecise(12340)).toBe('12.34s');
    expect(formatDurationPrecise(59990)).toBe('59.99s');
  });

  it('never rounds up to the next-larger unit', () => {
    expect(formatDurationPrecise(1500)).not.toBe('2s');
    expect(formatDurationPrecise(8500)).not.toBe('9s');
    expect(formatDurationPrecise(59999)).not.toBe('1m');
  });

  it('renders sub-hour values as minutes + decimal seconds', () => {
    expect(formatDurationPrecise(60_000)).toBe('1m');
    expect(formatDurationPrecise(65_000)).toBe('1m 5s');
    expect(formatDurationPrecise(65_200)).toBe('1m 5.2s');
    expect(formatDurationPrecise(125_500)).toBe('2m 5.5s');
  });

  it('renders longer durations as hour/day decomposition', () => {
    expect(formatDurationPrecise(3_600_000)).toBe('1h');
    expect(formatDurationPrecise(3_660_000)).toBe('1h 1m');
    expect(formatDurationPrecise(3_665_000)).toBe('1h 1m 5s');
    expect(formatDurationPrecise(90_061_000)).toBe('1d 1h 1m 1s');
  });
});
