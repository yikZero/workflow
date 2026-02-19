import type { Event } from '@workflow/world';
import { eventsLogger } from './logger.js';

export enum EventConsumerResult {
  /**
   * Callback consumed the event, but should not be removed from the callbacks list
   */
  Consumed,
  /**
   * Callback did not consume the event, so it should be passed to the next callback
   */
  NotConsumed,
  /**
   * Callback consumed the event, and should be removed from the callbacks list
   */
  Finished,
}

type EventConsumerCallback = (event: Event | null) => EventConsumerResult;

/**
 * How long (in ms) the watchdog waits without progress before firing the
 * onUnconsumedEvent callback. Workflow replay should be essentially instant,
 * so 1 second of no progress indicates a catastrophic issue (corrupted event
 * log, missing subscriber, etc.).
 */
const WATCHDOG_TIMEOUT_MS = 1000;

export interface EventsConsumerOptions {
  /**
   * Callback invoked when the EventsConsumer has events remaining but has
   * not made any progress (no events consumed, no new subscribers) for
   * {@link WATCHDOG_TIMEOUT_MS}. This indicates a catastrophic issue such
   * as a corrupted event log.
   */
  onUnconsumedEvent: (event: Event) => void;

  /**
   * Optional callback invoked whenever an event is successfully consumed
   * (a subscriber returned Consumed or Finished). This is used for passive
   * observation (e.g., updating the VM timestamp) without participating in
   * event matching — observers should NOT be regular subscribers because the
   * consume loop scans past unmatched events, and passive subscribers would
   * be called for events that aren't actually consumed yet.
   */
  onEventConsumed?: (event: Event) => void;
}

export class EventsConsumer {
  readonly events: Event[] = [];
  readonly callbacks: EventConsumerCallback[] = [];
  private onUnconsumedEvent: (event: Event) => void;
  private onEventConsumed?: (event: Event) => void;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private pendingResolves = 0;

  constructor(events: Event[], options: EventsConsumerOptions) {
    this.events = events;
    this.onUnconsumedEvent = options.onUnconsumedEvent;
    this.onEventConsumed = options.onEventConsumed;
  }

  /**
   * Registers a callback function to be called after an event has been consumed
   * by a different callback. The callback can return:
   *  - `EventConsumerResult.Consumed` the event is considered consumed and will not be passed to any other callback, but the callback will remain in the callbacks list
   *  - `EventConsumerResult.NotConsumed` the event is passed to the next callback
   *  - `EventConsumerResult.Finished` the event is considered consumed and the callback is removed from the callbacks list
   *
   * @param fn - The callback function to register.
   */
  subscribe(fn: EventConsumerCallback) {
    this.callbacks.push(fn);
    this.resetWatchdog();
    process.nextTick(this.consume);
  }

  /**
   * Enqueues an async resolve operation. While any enqueued resolves are
   * pending, the watchdog is suppressed. This is critical for async
   * decryption: without it, the watchdog could fire while crypto.subtle
   * is decrypting step results.
   *
   * Use this from event callbacks (step.ts, hook.ts) instead of raw
   * `setTimeout(async () => { resolve(await decrypt()) })` patterns.
   *
   * The provided function is scheduled via `setTimeout(0)` to preserve
   * macrotask timing semantics (matching the original synchronous code path).
   */
  enqueueResolve(fn: () => void | Promise<void>) {
    this.pendingResolves++;
    setTimeout(async () => {
      try {
        await fn();
      } finally {
        this.pendingResolves--;
        // Re-trigger consume after the async work is done. We use
        // setTimeout(0) instead of process.nextTick so that any Promise
        // microtasks triggered by the resolve (e.g., Promise.all resolution
        // → workflow code continues → new subscribe() calls) have a chance
        // to run first. process.nextTick runs BEFORE Promise microtasks in
        // Node.js, which would cause consume() to see an event with no
        // subscriber registered yet.
        setTimeout(this.consume, 0);
      }
    }, 0);
  }

  /**
   * Suppresses the watchdog. Call this before an async operation that will
   * eventually cause new subscribers to be registered (e.g., workflow args
   * decryption). Must be paired with `unsuppressUnconsumedCheck()`.
   */
  suppressUnconsumedCheck() {
    this.pendingResolves++;
  }

  /**
   * Unsuppresses the watchdog and re-triggers consume. Must be called after
   * the async operation completes.
   */
  unsuppressUnconsumedCheck() {
    this.pendingResolves--;
    process.nextTick(this.consume);
  }

  /**
   * Resets the watchdog timer. Called whenever progress is made (event
   * consumed, new subscriber registered). If the watchdog fires, it means
   * no progress has been made for WATCHDOG_TIMEOUT_MS and the replay is
   * deadlocked.
   */
  private resetWatchdog() {
    if (this.watchdog !== null) {
      clearTimeout(this.watchdog);
    }
    this.watchdog = setTimeout(() => {
      this.watchdog = null;
      // Only fire if there are remaining events and no pending async work
      if (this.events.length > 0 && this.pendingResolves === 0) {
        this.onUnconsumedEvent(this.events[0]);
      }
    }, WATCHDOG_TIMEOUT_MS);
  }

  private consume = () => {
    // Scan forward through the events array to find an event that a
    // subscriber can consume. Events that no subscriber matches are skipped
    // — they will be retried when new subscribers are registered (via
    // subscribe() → process.nextTick(consume)). This handles out-of-order
    // events in the event log: the step handler writes events asynchronously,
    // so events for a later step can appear before events for an earlier
    // step. Rather than getting stuck on the out-of-order event, we skip
    // past it to process events that current subscribers need.
    for (let eventIdx = 0; eventIdx < this.events.length; eventIdx++) {
      const event = this.events[eventIdx];
      for (let i = 0; i < this.callbacks.length; i++) {
        const callback = this.callbacks[i];
        let handled = EventConsumerResult.NotConsumed;
        try {
          handled = callback(event);
        } catch (error) {
          eventsLogger.error('EventConsumer callback threw an error', {
            error,
          });
        }
        if (
          handled === EventConsumerResult.Consumed ||
          handled === EventConsumerResult.Finished
        ) {
          // Consumer handled this event. Remove it from the events array.
          this.events.splice(eventIdx, 1);

          // Progress was made — reset the watchdog
          this.resetWatchdog();

          // Notify the observer (e.g., timestamp updater)
          this.onEventConsumed?.(event);

          // Remove the callback if it has finished
          if (handled === EventConsumerResult.Finished) {
            this.callbacks.splice(i, 1);
          }

          // Continue processing
          process.nextTick(this.consume);
          return;
        }
      }
    }

    // All events were scanned and none could be consumed. Pass null
    // (end-of-events) to subscribers so they can trigger WorkflowSuspension.
    for (let i = 0; i < this.callbacks.length; i++) {
      const callback = this.callbacks[i];
      let handled = EventConsumerResult.NotConsumed;
      try {
        handled = callback(null);
      } catch (error) {
        eventsLogger.error('EventConsumer callback threw an error', { error });
      }
      if (
        handled === EventConsumerResult.Consumed ||
        handled === EventConsumerResult.Finished
      ) {
        if (handled === EventConsumerResult.Finished) {
          this.callbacks.splice(i, 1);
        }
        process.nextTick(this.consume);
        return;
      }
    }
  };
}
