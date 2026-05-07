import { describe, expect, it, vi } from 'vitest';
import { DEFERRED_CHECK_DELAY_MS } from './events-consumer.js';
import {
  scheduleWhenIdle,
  type WorkflowOrchestratorContext,
} from './private.js';

/**
 * Builds a minimal WorkflowOrchestratorContext containing only the fields
 * that scheduleWhenIdle reads. Other fields are intentionally unused; the
 * cast keeps the harness narrow without dragging in EventsConsumer/VM setup.
 */
function makeCtx(): WorkflowOrchestratorContext {
  return {
    promiseQueue: Promise.resolve(),
    pendingDeliveries: 0,
  } as unknown as WorkflowOrchestratorContext;
}

/**
 * Yields long enough for a finite chain of microtasks + setTimeout(0) hops to
 * settle. scheduleWhenIdle's "no deliveries observed" fast path completes in
 * a small constant number of these hops, so 30ms is plenty of headroom while
 * still being well under DEFERRED_CHECK_DELAY_MS (100ms) — that gap is what
 * makes "fast vs deferred" distinguishable here.
 */
function settle(ms = 30): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('scheduleWhenIdle', () => {
  it('fires immediately on the fast path when no deliveries are ever observed', async () => {
    const ctx = makeCtx();
    const fn = vi.fn();

    const start = Date.now();
    scheduleWhenIdle(ctx, fn);

    await settle();
    const elapsed = Date.now() - start;

    expect(fn).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(DEFERRED_CHECK_DELAY_MS);
  });

  it('defers firing by DEFERRED_CHECK_DELAY_MS when an idle cycle observed deliveries', async () => {
    const ctx = makeCtx();
    ctx.pendingDeliveries = 1;
    const fn = vi.fn();

    scheduleWhenIdle(ctx, fn);

    // Let the polling loop observe pendingDeliveries > 0 and arm
    // sawPendingDeliveries before we drain the counter.
    await settle();
    expect(fn).not.toHaveBeenCalled();

    ctx.pendingDeliveries = 0;

    // After the drain completes the scheduler reaches fireWhenReady, which
    // (because deliveries were observed) waits REPLAY_PROPAGATION_DELAY_MS.
    // Verify it is still pending for a window strictly shorter than the delay.
    await settle(DEFERRED_CHECK_DELAY_MS / 2);
    expect(fn).not.toHaveBeenCalled();

    // Cross past the delay; suspension fires.
    await settle(DEFERRED_CHECK_DELAY_MS);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('re-loops when pendingDeliveries reappears during the deferred wait', async () => {
    const ctx = makeCtx();
    ctx.pendingDeliveries = 1;
    const fn = vi.fn();

    scheduleWhenIdle(ctx, fn);

    // Initial wave: arm sawPendingDeliveries, then drain to 0 so
    // fireWhenReady schedules the deferred timer.
    await settle();
    ctx.pendingDeliveries = 0;
    await settle();
    expect(fn).not.toHaveBeenCalled();

    // While the deferred timer is armed, a new replay delivery starts. When
    // the timer fires it must observe pendingDeliveries > 0 and loop instead
    // of suspending.
    ctx.pendingDeliveries = 2;
    await settle(DEFERRED_CHECK_DELAY_MS + 20);
    expect(fn).not.toHaveBeenCalled();

    // Drain again; eventually the scheduler reaches fireWhenReady once more
    // and fires after another deferred window.
    ctx.pendingDeliveries = 0;
    await settle(DEFERRED_CHECK_DELAY_MS * 2 + 30);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('continues to wait while pendingDeliveries stays > 0 across the initial poll', async () => {
    const ctx = makeCtx();
    ctx.pendingDeliveries = 1;
    const fn = vi.fn();

    scheduleWhenIdle(ctx, fn);

    // pendingDeliveries never reaches 0 within this window, so the loop
    // must keep polling and never call fn.
    await settle(DEFERRED_CHECK_DELAY_MS * 2);
    expect(fn).not.toHaveBeenCalled();

    // Drain; fn fires after the deferred propagation window.
    ctx.pendingDeliveries = 0;
    await settle(DEFERRED_CHECK_DELAY_MS * 2);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
