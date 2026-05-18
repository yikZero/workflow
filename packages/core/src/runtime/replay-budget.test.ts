import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplayBudget } from './replay-budget.js';

describe('ReplayBudget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts unpaused; elapsed time counts toward budget', () => {
    const budget = new ReplayBudget(1000);
    vi.advanceTimersByTime(500);
    expect(budget.elapsed()).toBe(500);
    expect(budget.isExhausted()).toBe(false);
    vi.advanceTimersByTime(500);
    expect(budget.elapsed()).toBe(1000);
    expect(budget.isExhausted()).toBe(true);
  });

  it('pause() stops counting; resume() resumes', () => {
    const budget = new ReplayBudget(1000);
    vi.advanceTimersByTime(300);
    expect(budget.elapsed()).toBe(300);
    budget.pause();
    vi.advanceTimersByTime(10_000);
    // Time during pause is not charged
    expect(budget.elapsed()).toBe(300);
    expect(budget.isExhausted()).toBe(false);
    budget.resume();
    vi.advanceTimersByTime(700);
    expect(budget.elapsed()).toBe(1000);
    expect(budget.isExhausted()).toBe(true);
  });

  it('pause() is idempotent — calling twice does not double-count', () => {
    const budget = new ReplayBudget(1000);
    vi.advanceTimersByTime(400);
    budget.pause();
    // Second pause is a no-op
    budget.pause();
    vi.advanceTimersByTime(5_000);
    budget.resume();
    vi.advanceTimersByTime(100);
    expect(budget.elapsed()).toBe(500);
  });

  it('resume() is idempotent in the sense that back-to-back resumes do not skew elapsed', () => {
    const budget = new ReplayBudget(1000);
    vi.advanceTimersByTime(200);
    budget.pause();
    vi.advanceTimersByTime(100);
    budget.resume();
    budget.resume(); // no-op since no time has passed
    vi.advanceTimersByTime(100);
    expect(budget.elapsed()).toBe(300);
  });

  it('handles multiple pause/resume cycles (e.g. multiple inline steps)', () => {
    const budget = new ReplayBudget(10_000);

    // Initial non-step interval
    vi.advanceTimersByTime(100);
    expect(budget.elapsed()).toBe(100);

    // Step 1
    budget.pause();
    vi.advanceTimersByTime(60_000); // long step
    budget.resume();

    // More non-step work
    vi.advanceTimersByTime(200);

    // Step 2
    budget.pause();
    vi.advanceTimersByTime(30_000);
    budget.resume();

    // Final non-step work
    vi.advanceTimersByTime(300);

    // 100 + 200 + 300 = 600ms charged, 90s of step time excluded
    expect(budget.elapsed()).toBe(600);
    expect(budget.isExhausted()).toBe(false);
  });

  it('configuredLimitMs returns the configured limit', () => {
    const budget = new ReplayBudget(12_345);
    expect(budget.configuredLimitMs).toBe(12_345);
  });

  it('isExhausted() reflects current state including the open interval', () => {
    const budget = new ReplayBudget(1000);
    vi.advanceTimersByTime(999);
    expect(budget.isExhausted()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(budget.isExhausted()).toBe(true);
  });

  it('isExhausted() does not advance while paused', () => {
    const budget = new ReplayBudget(1000);
    vi.advanceTimersByTime(500);
    budget.pause();
    vi.advanceTimersByTime(60_000); // simulate very long step
    expect(budget.isExhausted()).toBe(false);
    budget.resume();
    vi.advanceTimersByTime(499);
    expect(budget.isExhausted()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(budget.isExhausted()).toBe(true);
  });

  it('regression: 8-minute step does not exhaust default budget', () => {
    // Reproduces the user scenario from
    // https://github.com/vercel/workflow/issues/2009 — an 8-minute step
    // under the default 240s budget should not trip exhaustion because
    // step time is excluded from the budget.
    const budget = new ReplayBudget(240_000);
    // 100ms of non-step work (event load, replay setup)
    vi.advanceTimersByTime(100);
    // Step body: 8 minutes
    budget.pause();
    vi.advanceTimersByTime(8 * 60 * 1000);
    budget.resume();
    // A bit more non-step work (write result event)
    vi.advanceTimersByTime(50);
    expect(budget.isExhausted()).toBe(false);
    expect(budget.elapsed()).toBe(150);
  });
});
