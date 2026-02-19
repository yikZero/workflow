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

export interface EventsConsumerOptions {
  /**
   * Callback invoked when a non-null event cannot be consumed by any registered
   * callback, indicating an orphaned or invalid event in the event log. Called
   * only after a subscribe+consume cycle fails to make progress, confirming
   * the event is truly unconsumed rather than simply waiting for a subscriber
   * that hasn't been registered yet.
   */
  onUnconsumedEvent: (event: Event) => void;

  /**
   * Optional callback invoked whenever an event is successfully consumed
   * (a subscriber returned Consumed or Finished). This is used for passive
   * observation (e.g., updating the VM timestamp) without participating in
   * event matching — observers should NOT be regular subscribers because the
   * consume loop may scan past events to find a match, and passive
   * subscribers would be called for events that aren't actually consumed.
   */
  onEventConsumed?: (event: Event) => void;
}

export class EventsConsumer {
  eventIndex: number;
  readonly events: Event[] = [];
  readonly callbacks: EventConsumerCallback[] = [];
  private onUnconsumedEvent: (event: Event) => void;
  private onEventConsumed?: (event: Event) => void;
  private pendingUnconsumedCheck: ReturnType<typeof setTimeout> | null = null;
  private pendingResolves = 0;

  constructor(events: Event[], options: EventsConsumerOptions) {
    this.events = events;
    this.eventIndex = 0;
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
    // Cancel any pending unconsumed check since a new callback may consume the event
    if (this.pendingUnconsumedCheck !== null) {
      clearTimeout(this.pendingUnconsumedCheck);
      this.pendingUnconsumedCheck = null;
    }
    // Record the events array length before consume runs. After consume
    // settles, if no events were consumed (length unchanged) and no async
    // resolves are pending, the remaining events are truly orphaned.
    const lengthBeforeConsume = this.events.length;
    process.nextTick(this.consume);
    // Schedule the unconsumed check AFTER the consume nextTick. We use
    // setTimeout(0) which fires after all nextTicks and microtasks, giving
    // the consume loop and any subsequent subscribe() calls a chance to run.
    this.pendingUnconsumedCheck = setTimeout(() => {
      this.pendingUnconsumedCheck = null;
      if (
        this.events.length === lengthBeforeConsume &&
        this.events.length > 0 &&
        this.pendingResolves === 0
      ) {
        const event = this.events[this.eventIndex];
        if (event) {
          this.onUnconsumedEvent(event);
        }
      }
    }, 0);
  }

  /**
   * Enqueues an async resolve operation. While any enqueued resolves are
   * pending, the unconsumed event check is suppressed. This is critical for
   * async decryption: without it, the EventsConsumer would flag subsequent
   * events as "unconsumed" because the async decrypt delays the Promise
   * resolution, which delays the workflow code from registering new consumers.
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
   * Suppresses the unconsumed event check. Call this before an async operation
   * that will eventually cause new subscribers to be registered (e.g., workflow
   * args decryption). Must be paired with `unsuppressUnconsumedCheck()`.
   */
  suppressUnconsumedCheck() {
    this.pendingResolves++;
  }

  /**
   * Unsuppresses the unconsumed event check and re-triggers consume.
   * Must be called after the async operation completes (and new subscribers
   * have been or will be registered as a result).
   */
  unsuppressUnconsumedCheck() {
    this.pendingResolves--;
    process.nextTick(this.consume);
  }

  private consume = () => {
    // Scan forward from the current position to find the next event that
    // a subscriber can consume. Events that no subscriber matches are
    // skipped — they will be retried when new subscribers are registered
    // (via subscribe() → process.nextTick(consume)). This handles
    // out-of-order events in the event log: the step handler writes events
    // asynchronously, so events for a later step can appear before events
    // for an earlier step. Rather than getting stuck on the out-of-order
    // event, we skip past it to process events that current subscribers need.
    for (
      let eventIdx = this.eventIndex;
      eventIdx < this.events.length;
      eventIdx++
    ) {
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
          // Consumer handled this event. Remove it from the events array
          // at its current position. The eventIndex stays the same (since
          // we removed an event at or after the current index, the next
          // unprocessed event shifts into position).
          this.events.splice(eventIdx, 1);

          // Notify the observer (e.g., timestamp updater)
          this.onEventConsumed?.(event);

          // remove the callback if it has finished
          if (handled === EventConsumerResult.Finished) {
            this.callbacks.splice(i, 1);
          }

          // continue to the next event
          process.nextTick(this.consume);
          return;
        }
      }
    }

    // All events were scanned and none could be consumed. Try passing null
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
