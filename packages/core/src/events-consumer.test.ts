import type { Event } from '@workflow/world';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventConsumerResult, EventsConsumer } from './events-consumer.js';

// Helper function to create mock events
function createMockEvent(overrides: Partial<Event> = {}): Event {
  return {
    eventId: 'event-1',
    runId: 'run-1',
    eventType: 'test-event',
    eventData: { value: 'test' },
    createdAt: new Date(),
    ...overrides,
  } as Event;
}

// Default options for tests that don't care about onUnconsumedEvent
const defaultOptions = { onUnconsumedEvent: vi.fn() };

// Helper function to wait for next tick
function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => process.nextTick(resolve));
}

describe('EventsConsumer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with provided events', () => {
      const events = [
        createMockEvent(),
        createMockEvent({ eventId: 'event-2' }),
      ];
      const consumer = new EventsConsumer(events, defaultOptions);

      expect(consumer.events).toEqual(events);
      expect(consumer.events.length).toBe(2);
      expect(consumer.callbacks).toEqual([]);
    });

    it('should initialize with empty events array', () => {
      const consumer = new EventsConsumer([], defaultOptions);

      expect(consumer.events).toEqual([]);
      expect(consumer.events.length).toBe(0);
      expect(consumer.callbacks).toEqual([]);
    });
  });

  describe('subscribe', () => {
    it('should add callback to callbacks array', () => {
      const consumer = new EventsConsumer([], defaultOptions);
      const callback = vi.fn();

      consumer.subscribe(callback);

      expect(consumer.callbacks).toContain(callback);
      expect(consumer.callbacks).toHaveLength(1);
    });

    it('should add multiple callbacks in order', () => {
      const consumer = new EventsConsumer([], defaultOptions);
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      consumer.subscribe(callback1);
      consumer.subscribe(callback2);
      consumer.subscribe(callback3);

      expect(consumer.callbacks).toEqual([callback1, callback2, callback3]);
    });

    it('should automatically trigger consume on subscribe', async () => {
      const event = createMockEvent();
      const consumer = new EventsConsumer([event], defaultOptions);
      const callback = vi.fn().mockReturnValue(EventConsumerResult.NotConsumed);

      consumer.subscribe(callback);
      await waitForNextTick();

      // Called once with the event (scan phase), once with null (end-of-events)
      expect(callback).toHaveBeenCalledWith(event);
      expect(callback).toHaveBeenCalledWith(null);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('consume (implicit)', () => {
    it('should call callbacks with current event', async () => {
      const event = createMockEvent();
      const consumer = new EventsConsumer([event], defaultOptions);
      const callback = vi.fn().mockReturnValue(EventConsumerResult.NotConsumed);

      consumer.subscribe(callback);
      await waitForNextTick();

      // Called once with the event (scan phase), once with null (end-of-events)
      expect(callback).toHaveBeenCalledWith(event);
      expect(callback).toHaveBeenCalledWith(null);
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('should call callbacks with null when no events exist', async () => {
      const consumer = new EventsConsumer([], defaultOptions);
      const callback = vi.fn().mockReturnValue(EventConsumerResult.NotConsumed);

      consumer.subscribe(callback);
      await waitForNextTick();

      expect(callback).toHaveBeenCalledWith(null);
    });

    it('should remove consumed event and remove callback when callback returns Finished', async () => {
      const event1 = createMockEvent({ eventId: 'event-1' });
      const event2 = createMockEvent({ eventId: 'event-2' });
      const consumer = new EventsConsumer([event1, event2], defaultOptions);
      const callback = vi.fn().mockReturnValue(EventConsumerResult.Finished);

      consumer.subscribe(callback);
      await waitForNextTick();

      // event1 consumed and spliced out, event2 remains
      expect(consumer.events).toHaveLength(1);
      expect(consumer.callbacks).toHaveLength(0);
    });

    it('should not consume event when callback returns NotConsumed', async () => {
      const event = createMockEvent();
      const consumer = new EventsConsumer([event], defaultOptions);
      const callback = vi.fn().mockReturnValue(EventConsumerResult.NotConsumed);

      consumer.subscribe(callback);
      await waitForNextTick();

      expect(consumer.events.length).toBe(1);
      expect(consumer.callbacks).toContain(callback);
    });

    it('should process multiple callbacks until one returns true', async () => {
      const event = createMockEvent();
      const consumer = new EventsConsumer([event], defaultOptions);
      const callback1 = vi
        .fn()
        .mockReturnValue(EventConsumerResult.NotConsumed);
      const callback2 = vi.fn().mockReturnValue(EventConsumerResult.Finished);
      const callback3 = vi
        .fn()
        .mockReturnValue(EventConsumerResult.NotConsumed);

      consumer.subscribe(callback1);
      consumer.subscribe(callback2);
      consumer.subscribe(callback3);
      await waitForNextTick();

      expect(callback1).toHaveBeenCalledWith(event);
      expect(callback2).toHaveBeenCalledWith(event);
      expect(callback3).toHaveBeenCalledWith(null);
      expect(consumer.events).toHaveLength(0);
      expect(consumer.callbacks).toEqual([callback1, callback3]);
    });

    it('should process all callbacks when none return true and call onUnconsumedEvent', async () => {
      const event = createMockEvent();
      const onUnconsumedEvent = vi.fn();
      const consumer = new EventsConsumer([event], { onUnconsumedEvent });
      const callback1 = vi
        .fn()
        .mockReturnValue(EventConsumerResult.NotConsumed);
      const callback2 = vi
        .fn()
        .mockReturnValue(EventConsumerResult.NotConsumed);
      const callback3 = vi
        .fn()
        .mockReturnValue(EventConsumerResult.NotConsumed);

      consumer.subscribe(callback1);
      consumer.subscribe(callback2);
      consumer.subscribe(callback3);
      await waitForNextTick();

      expect(callback1).toHaveBeenCalledWith(event);
      expect(callback2).toHaveBeenCalledWith(event);
      expect(callback3).toHaveBeenCalledWith(event);
      expect(consumer.events.length).toBe(1);
      expect(consumer.callbacks).toEqual([callback1, callback2, callback3]);

      // onUnconsumedEvent fires after 1-second watchdog timeout
      vi.advanceTimersByTime(1000);
      expect(onUnconsumedEvent).toHaveBeenCalledWith(event);
    });

    it('should recursively process next event when current event is consumed', async () => {
      const event1 = createMockEvent({ eventId: 'event-1' });
      const event2 = createMockEvent({ eventId: 'event-2' });
      const consumer = new EventsConsumer([event1, event2], defaultOptions);
      const callback1 = vi.fn().mockReturnValue(EventConsumerResult.Finished);
      const callback2 = vi.fn().mockReturnValue(EventConsumerResult.Finished);

      consumer.subscribe(callback1);
      consumer.subscribe(callback2);
      await waitForNextTick();
      await waitForNextTick(); // Wait for recursive processing

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback1).toHaveBeenCalledWith(event1);
      expect(callback2).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledWith(event2);
      expect(consumer.events.length).toBe(0);
      expect(consumer.callbacks).toHaveLength(0);
    });

    it('should handle event index beyond events array length', async () => {
      const event = createMockEvent();
      const consumer = new EventsConsumer([event], defaultOptions);
      const callback = vi.fn().mockReturnValue(EventConsumerResult.Finished);

      consumer.subscribe(callback);
      await waitForNextTick();

      // Now events array is empty after consuming the event
      const callback2 = vi
        .fn()
        .mockReturnValue(EventConsumerResult.NotConsumed);
      consumer.subscribe(callback2);
      await waitForNextTick();

      expect(callback2).toHaveBeenCalledWith(null);
    });

    it('should handle complex event processing scenario', async () => {
      const events = [
        createMockEvent({ eventId: 'event-1', eventType: 'type-a' } as any),
        createMockEvent({ eventId: 'event-2', eventType: 'type-b' } as any),
        createMockEvent({ eventId: 'event-3', eventType: 'type-a' } as any),
      ];
      const consumer = new EventsConsumer(events, defaultOptions);

      // Callback that only processes type-a events
      const typeACallback = vi
        .fn()
        .mockImplementation((event: Event | null) => {
          return (event?.eventType as string) === 'type-a'
            ? EventConsumerResult.Finished
            : EventConsumerResult.NotConsumed;
        });

      // Callback that only processes type-b events
      const typeBCallback = vi
        .fn()
        .mockImplementation((event: Event | null) => {
          return (event?.eventType as string) === 'type-b'
            ? EventConsumerResult.Finished
            : EventConsumerResult.NotConsumed;
        });

      consumer.subscribe(typeACallback);
      consumer.subscribe(typeBCallback);
      await waitForNextTick();
      await waitForNextTick(); // Wait for recursive processing
      await waitForNextTick(); // Wait for final processing

      // typeACallback consumes event-1, typeBCallback consumes event-2
      // event-3 remains since both callbacks are removed after consuming
      expect(typeACallback).toHaveBeenCalledTimes(1); // Called for event-1 only
      expect(typeBCallback).toHaveBeenCalledTimes(1); // Called for event-2
      expect(consumer.events).toHaveLength(1); // event-3 remains
      expect(consumer.callbacks).toHaveLength(0); // Both callbacks removed after consuming their events
    });
  });

  describe('edge cases', () => {
    it('should handle callback that throws error gracefully', async () => {
      const event = createMockEvent();
      const consumer = new EventsConsumer([event], defaultOptions);
      const throwingCallback = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const normalCallback = vi
        .fn()
        .mockReturnValue(EventConsumerResult.Finished);

      consumer.subscribe(throwingCallback);
      consumer.subscribe(normalCallback);
      await waitForNextTick();

      // Error is caught and logged via eventsLogger, processing continues to next callback
      expect(throwingCallback).toHaveBeenCalledWith(event);
      expect(normalCallback).toHaveBeenCalledWith(event);
    });

    it('should handle callback removal during iteration', async () => {
      const event = createMockEvent();
      const consumer = new EventsConsumer([event], defaultOptions);
      const callback1 = vi
        .fn()
        .mockReturnValue(EventConsumerResult.NotConsumed);
      const callback2 = vi.fn().mockReturnValue(EventConsumerResult.Finished);
      const callback3 = vi
        .fn()
        .mockReturnValue(EventConsumerResult.NotConsumed);

      consumer.subscribe(callback1);
      consumer.subscribe(callback2);
      consumer.subscribe(callback3);
      await waitForNextTick();

      // callback2 should be removed when it returns Finished
      expect(consumer.callbacks).toEqual([callback1, callback3]);
      expect(callback3).toHaveBeenCalledWith(null);
    });

    it('should handle events with null/undefined data', async () => {
      const eventWithNullData = createMockEvent({ eventData: null as any });
      const consumer = new EventsConsumer([eventWithNullData], defaultOptions);
      const callback = vi.fn().mockReturnValue(EventConsumerResult.Finished);

      consumer.subscribe(callback);
      await waitForNextTick();

      expect(callback).toHaveBeenCalledWith(eventWithNullData);
      expect(consumer.events.length).toBe(0);
    });

    it('should handle multiple subscriptions happening in sequence', async () => {
      const event1 = createMockEvent({ eventId: 'event-1' });
      const event2 = createMockEvent({ eventId: 'event-2' });
      const consumer = new EventsConsumer([event1, event2], defaultOptions);

      const callback1 = vi.fn().mockReturnValue(EventConsumerResult.Finished);
      const callback2 = vi.fn().mockReturnValue(EventConsumerResult.Finished);

      consumer.subscribe(callback1);
      await waitForNextTick();

      consumer.subscribe(callback2);
      await waitForNextTick();

      expect(callback1).toHaveBeenCalledWith(event1);
      expect(callback2).toHaveBeenCalledWith(event2);
      expect(consumer.events.length).toBe(0);
    });

    it('should handle empty events array gracefully', async () => {
      const consumer = new EventsConsumer([], defaultOptions);
      const callback = vi.fn().mockReturnValue(EventConsumerResult.NotConsumed);

      consumer.subscribe(callback);
      await waitForNextTick();

      expect(callback).toHaveBeenCalledWith(null);
      expect(consumer.events.length).toBe(0);
    });
  });

  describe('onUnconsumedEvent', () => {
    it('should call onUnconsumedEvent when a non-null event is not consumed by any callback', async () => {
      const event = createMockEvent();
      const onUnconsumedEvent = vi.fn();
      const consumer = new EventsConsumer([event], { onUnconsumedEvent });
      const callback = vi.fn().mockReturnValue(EventConsumerResult.NotConsumed);

      consumer.subscribe(callback);
      await waitForNextTick();

      // Watchdog fires after 1 second of no progress
      vi.advanceTimersByTime(1000);
      expect(onUnconsumedEvent).toHaveBeenCalledWith(event);
    });

    it('should NOT call onUnconsumedEvent for null event (end-of-events)', async () => {
      const onUnconsumedEvent = vi.fn();
      const consumer = new EventsConsumer([], { onUnconsumedEvent });
      const callback = vi.fn().mockReturnValue(EventConsumerResult.NotConsumed);

      consumer.subscribe(callback);
      await waitForNextTick();

      // Advance past the watchdog timeout
      vi.advanceTimersByTime(1000);

      expect(callback).toHaveBeenCalledWith(null);
      expect(onUnconsumedEvent).not.toHaveBeenCalled();
    });

    it('should cancel pending unconsumed check when a new callback subscribes', async () => {
      const event = createMockEvent();
      const onUnconsumedEvent = vi.fn();
      const consumer = new EventsConsumer([event], { onUnconsumedEvent });
      const callback1 = vi
        .fn()
        .mockReturnValue(EventConsumerResult.NotConsumed);

      consumer.subscribe(callback1);
      await waitForNextTick();

      // Before the watchdog fires, subscribe a new callback that consumes the event
      const callback2 = vi.fn().mockReturnValue(EventConsumerResult.Finished);
      consumer.subscribe(callback2);
      await waitForNextTick();

      // Advance past the watchdog timeout - should NOT fire since subscribe reset it
      // and the event was consumed
      vi.advanceTimersByTime(1000);

      // The new callback consumed the event, so onUnconsumedEvent should NOT be called
      expect(onUnconsumedEvent).not.toHaveBeenCalled();
      expect(consumer.events.length).toBe(0);
    });
  });
});
