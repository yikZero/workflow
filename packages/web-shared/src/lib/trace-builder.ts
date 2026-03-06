/**
 * Builds a complete trace from a WorkflowRun and its Events.
 *
 * This module groups raw events by correlation ID and entity type,
 * converts each group into an OpenTelemetry-style Span, and returns
 * a fully-formed Trace ready for the trace viewer.
 */

import type { Event, WorkflowRun } from '@workflow/world';
import type { Span } from '../components/trace-viewer/types';
import {
  hookToSpan,
  runToSpan,
  stepToSpan,
  waitToSpan,
  WORKFLOW_LIBRARY,
} from '../components/workflow-traces/trace-span-construction';
import { otelTimeToMs } from '../components/workflow-traces/trace-time-utils';

// ---------------------------------------------------------------------------
// Event type classifiers
// ---------------------------------------------------------------------------

export const isStepEvent = (eventType: string) => eventType.startsWith('step_');

export const isTimerEvent = (eventType: string) =>
  eventType === 'wait_created' || eventType === 'wait_completed';

export const isHookLifecycleEvent = (eventType: string) =>
  eventType === 'hook_received' ||
  eventType === 'hook_created' ||
  eventType === 'hook_disposed';

// ---------------------------------------------------------------------------
// Event grouping
// ---------------------------------------------------------------------------

export type GroupedEvents = {
  eventsByStepId: Map<string, Event[]>;
  runLevelEvents: Event[];
  timerEvents: Map<string, Event[]>;
  hookEvents: Map<string, Event[]>;
};

function pushEvent(
  map: Map<string, Event[]>,
  correlationId: string,
  event: Event
) {
  const existing = map.get(correlationId);
  if (existing) {
    existing.push(event);
    return;
  }
  map.set(correlationId, [event]);
}

export function groupEventsByCorrelation(events: Event[]): GroupedEvents {
  const eventsByStepId = new Map<string, Event[]>();
  const runLevelEvents: Event[] = [];
  const timerEvents = new Map<string, Event[]>();
  const hookEvents = new Map<string, Event[]>();

  for (const event of events) {
    const correlationId = event.correlationId;
    if (!correlationId) {
      runLevelEvents.push(event);
      continue;
    }

    if (isTimerEvent(event.eventType)) {
      pushEvent(timerEvents, correlationId, event);
      continue;
    }

    if (isHookLifecycleEvent(event.eventType)) {
      pushEvent(hookEvents, correlationId, event);
      continue;
    }

    if (isStepEvent(event.eventType)) {
      pushEvent(eventsByStepId, correlationId, event);
      continue;
    }

    runLevelEvents.push(event);
  }

  return { eventsByStepId, runLevelEvents, timerEvents, hookEvents };
}

// ---------------------------------------------------------------------------
// Trace construction
// ---------------------------------------------------------------------------

function buildSpans(run: WorkflowRun, groupedEvents: GroupedEvents, now: Date) {
  const stepSpans = Array.from(groupedEvents.eventsByStepId.values())
    .map((events) => stepToSpan(events, run, now))
    .filter((span): span is Span => span !== null);

  const hookSpans = Array.from(groupedEvents.hookEvents.values())
    .map((events) => hookToSpan(events, run, now))
    .filter((span): span is Span => span !== null);

  const waitSpans = Array.from(groupedEvents.timerEvents.values())
    .map((events) => waitToSpan(events, run, now))
    .filter((span): span is Span => span !== null);

  return {
    runSpan: runToSpan(run, groupedEvents.runLevelEvents, now),
    spans: [...stepSpans, ...hookSpans, ...waitSpans],
  };
}

function cascadeSpans(runSpan: Span, spans: Span[]) {
  const sortedSpans = [
    runSpan,
    ...spans.slice().sort((a, b) => {
      const aStart = otelTimeToMs(a.startTime);
      const bStart = otelTimeToMs(b.startTime);
      return aStart - bStart;
    }),
  ];

  return sortedSpans.map((span, index) => {
    const parentSpanId =
      index === 0 ? undefined : String(sortedSpans[index - 1].spanId);
    return {
      ...span,
      parentSpanId,
    };
  });
}

export function buildTrace(run: WorkflowRun, events: Event[], now: Date) {
  const groupedEvents = groupEventsByCorrelation(events);
  const { runSpan, spans } = buildSpans(run, groupedEvents, now);
  const sortedCascadingSpans = cascadeSpans(runSpan, spans);

  return {
    traceId: run.runId,
    rootSpanId: run.runId,
    spans: sortedCascadingSpans,
    resources: [
      {
        name: 'workflow',
        attributes: {
          'service.name': WORKFLOW_LIBRARY.name,
        },
      },
    ],
  };
}
