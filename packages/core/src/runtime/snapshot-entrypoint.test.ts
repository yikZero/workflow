import type { Event } from '@workflow/world';
import { describe, expect, it } from 'vitest';
import { canSkipSnapshotLoad } from './snapshot-entrypoint.js';

/**
 * Helper to build a minimally-shaped Event for tests. Only `eventType`
 * is read by `canSkipSnapshotLoad`, the rest are placeholders.
 */
function ev(eventType: Event['eventType']): Event {
  return {
    eventId: `evnt_test_${eventType}`,
    runId: 'wrun_test',
    correlationId: undefined,
    eventType,
    eventData: undefined,
    createdAt: new Date(),
    specVersion: 2,
    // biome-ignore lint/suspicious/noExplicitAny: minimal test fixture
  } as any;
}

describe('canSkipSnapshotLoad', () => {
  it('returns false when preloadedEvents is undefined', () => {
    expect(canSkipSnapshotLoad(undefined)).toBe(false);
  });

  it('returns false when preloadedEvents is an empty array', () => {
    expect(canSkipSnapshotLoad([])).toBe(false);
  });

  it('returns true for run_created + run_started only (very first invocation)', () => {
    expect(canSkipSnapshotLoad([ev('run_created'), ev('run_started')])).toBe(
      true
    );
  });

  it('returns true for run_started only (resilient-start path with no run_created replayed)', () => {
    expect(canSkipSnapshotLoad([ev('run_started')])).toBe(true);
  });

  it('returns false when a step_created event is present', () => {
    expect(
      canSkipSnapshotLoad([
        ev('run_created'),
        ev('run_started'),
        ev('step_created'),
      ])
    ).toBe(false);
  });

  it('returns false when a step_completed event is present', () => {
    expect(
      canSkipSnapshotLoad([
        ev('run_created'),
        ev('run_started'),
        ev('step_created'),
        ev('step_started'),
        ev('step_completed'),
      ])
    ).toBe(false);
  });

  it('returns false when a hook_received event is present (hook resume)', () => {
    expect(
      canSkipSnapshotLoad([
        ev('run_created'),
        ev('run_started'),
        ev('hook_created'),
        ev('hook_received'),
      ])
    ).toBe(false);
  });

  it('returns false when a wait_completed event is present (wait elapsed)', () => {
    expect(
      canSkipSnapshotLoad([
        ev('run_created'),
        ev('run_started'),
        ev('wait_created'),
        ev('wait_completed'),
      ])
    ).toBe(false);
  });
});
