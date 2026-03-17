import { formatDuration } from '../../lib/utils';
import type { RootNode, SpanNode, Trace } from '../trace-viewer/types';
import { parseTrace } from '../trace-viewer/util/tree';
import type { FlatSpan, ResourceType } from './types';

export { formatDuration };

export type StepTimelineSegmentStatus =
  | 'queued'
  | 'running'
  | 'failed'
  | 'retrying'
  | 'succeeded';

export interface StepTimelineSegment {
  startFraction: number;
  endFraction: number;
  status: StepTimelineSegmentStatus;
}

const STEP_SEGMENT_EPSILON = 0.001;
const PARALLEL_EPSILON = 0.001;
const STEP_EVENT_ORDER: Record<
  'step_started' | 'step_retrying' | 'step_failed' | 'step_completed',
  number
> = {
  step_started: 0,
  step_retrying: 1,
  step_failed: 2,
  step_completed: 3,
};

type StepEventName =
  | 'step_started'
  | 'step_retrying'
  | 'step_failed'
  | 'step_completed';

interface StepEventMark {
  name: StepEventName;
  fraction: number;
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function timeToFraction(
  timestamp: number,
  startTime: number,
  duration: number
): number {
  if (duration <= 0) return 0;
  return clampFraction((timestamp - startTime) / duration);
}

function pushStepSegment(
  segments: StepTimelineSegment[],
  startFraction: number,
  endFraction: number,
  status: StepTimelineSegmentStatus
): void {
  const start = clampFraction(startFraction);
  const end = clampFraction(endFraction);

  if (end - start <= STEP_SEGMENT_EPSILON) return;

  const previous = segments[segments.length - 1];
  if (!previous) {
    segments.push({ startFraction: start, endFraction: end, status });
    return;
  }

  if (
    previous.status === status &&
    start <= previous.endFraction + STEP_SEGMENT_EPSILON
  ) {
    previous.endFraction = Math.max(previous.endFraction, end);
    return;
  }

  segments.push({ startFraction: start, endFraction: end, status });
}

function isStepEventName(name: string): name is StepEventName {
  return (
    name === 'step_started' ||
    name === 'step_retrying' ||
    name === 'step_failed' ||
    name === 'step_completed'
  );
}

function getStepEventMarks(
  span: Pick<FlatSpan, 'startTime' | 'duration' | 'events'>
): StepEventMark[] {
  return span.events
    .filter(
      (event): event is FlatSpan['events'][number] & { name: StepEventName } =>
        isStepEventName(event.name)
    )
    .map((event) => ({
      name: event.name,
      fraction: timeToFraction(event.timestamp, span.startTime, span.duration),
    }))
    .sort((a, b) =>
      a.fraction === b.fraction
        ? STEP_EVENT_ORDER[a.name] - STEP_EVENT_ORDER[b.name]
        : a.fraction - b.fraction
    );
}

function getQueuedEndFraction(
  span: Pick<FlatSpan, 'startTime' | 'duration' | 'activeStartTime'>,
  marks: StepEventMark[]
): number | null {
  if (marks.length > 0) {
    return marks[0].fraction;
  }
  if (span.activeStartTime != null && span.activeStartTime > span.startTime) {
    return timeToFraction(span.activeStartTime, span.startTime, span.duration);
  }
  return null;
}

function getStartedSegmentStatus(
  nextName: StepEventName | undefined,
  isErrored: boolean
): StepTimelineSegmentStatus {
  if (!nextName) {
    return isErrored ? 'failed' : 'running';
  }
  if (nextName === 'step_retrying' || nextName === 'step_failed') {
    return 'failed';
  }
  if (nextName === 'step_completed') {
    return 'succeeded';
  }
  return 'running';
}

function appendMarkSegments(
  segments: StepTimelineSegment[],
  current: StepEventMark,
  next: StepEventMark | undefined,
  isErrored: boolean
): void {
  const nextFraction = next ? next.fraction : 1;

  if (current.name === 'step_started') {
    pushStepSegment(
      segments,
      current.fraction,
      nextFraction,
      getStartedSegmentStatus(next?.name, isErrored)
    );
    return;
  }

  if (current.name === 'step_retrying') {
    pushStepSegment(segments, current.fraction, nextFraction, 'retrying');
    return;
  }

  if (current.name === 'step_failed') {
    pushStepSegment(segments, current.fraction, 1, 'failed');
    return;
  }

  pushStepSegment(segments, current.fraction, 1, 'succeeded');
}

function getTrailingStepStatus(
  marks: StepEventMark[],
  isErrored: boolean
): StepTimelineSegmentStatus {
  const hasCompleted = marks.some((mark) => mark.name === 'step_completed');
  if (hasCompleted) return 'succeeded';

  const hasFailed = marks.some((mark) => mark.name === 'step_failed');
  if (hasFailed || isErrored) return 'failed';

  return 'running';
}

function hasSpanEvent(span: SpanNode, eventName: string): boolean {
  const events = span.events;
  if (!events) return false;

  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event.name === eventName) return true;
  }

  return false;
}

function spansOverlap(a: SpanNode, b: SpanNode): boolean {
  return (
    a.startTime < b.endTime - PARALLEL_EPSILON &&
    b.startTime < a.endTime - PARALLEL_EPSILON
  );
}

function getParallelSiblingIds(children: SpanNode[]): Set<string> {
  const parallelIds = new Set<string>();
  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      if (spansOverlap(children[i], children[j])) {
        parallelIds.add(children[i].span.spanId);
        parallelIds.add(children[j].span.spanId);
      }
    }
  }
  return parallelIds;
}

export function computeStepTimelineSegments(
  span: Pick<
    FlatSpan,
    'startTime' | 'duration' | 'events' | 'activeStartTime' | 'isErrored'
  >
): StepTimelineSegment[] {
  if (span.duration <= 0) {
    return [];
  }

  const marks = getStepEventMarks(span);
  const segments: StepTimelineSegment[] = [];

  const queuedEndFraction = getQueuedEndFraction(span, marks);
  if (queuedEndFraction != null) {
    pushStepSegment(segments, 0, queuedEndFraction, 'queued');
  }

  for (let i = 0; i < marks.length; i++) {
    appendMarkSegments(segments, marks[i], marks[i + 1], span.isErrored);
  }

  if (segments.length === 0) {
    pushStepSegment(segments, 0, 1, span.isErrored ? 'failed' : 'running');
    return segments;
  }

  const last = segments[segments.length - 1];
  if (last.endFraction < 1 - STEP_SEGMENT_EPSILON) {
    pushStepSegment(
      segments,
      last.endFraction,
      1,
      getTrailingStepStatus(marks, span.isErrored)
    );
  }

  return segments;
}

export function getResourceType(span: SpanNode): ResourceType {
  const resource = span.span.attributes?.resource;
  if (
    resource === 'run' ||
    resource === 'step' ||
    resource === 'hook' ||
    resource === 'sleep'
  ) {
    return resource;
  }
  return 'default';
}

function isSpanErrored(span: SpanNode): boolean {
  const status = span.span.status?.code;
  if (status === 2) return true;

  const data = span.span.attributes?.data as { status?: string } | undefined;
  if (data?.status === 'failed') return true;

  const resource = span.span.attributes?.resource;
  if (resource === 'step') return hasSpanEvent(span, 'step_failed');
  if (resource === 'run') return hasSpanEvent(span, 'run_failed');

  return false;
}

function flattenNode(
  node: SpanNode,
  result: FlatSpan[],
  siblings: SpanNode[],
  siblingIndex: number,
  parallelSiblingIds: Set<string>,
  activeConnectors: number[],
  parentDepth: number,
  parentIsRoot: boolean,
  parentIsRun: boolean
): void {
  const isParallelSibling = parallelSiblingIds.has(node.span.spanId);
  const shouldIndentFromParent =
    parentIsRoot || parentIsRun || isParallelSibling;
  const depth = parentDepth + (shouldIndentFromParent ? 1 : 0);
  const isLastParallelSibling =
    !isParallelSibling ||
    !siblings
      .slice(siblingIndex + 1)
      .some((sibling) => parallelSiblingIds.has(sibling.span.spanId));
  const resourceType = getResourceType(node);

  result.push({
    spanId: node.span.spanId,
    name: node.label || node.span.name,
    depth,
    hasParentConnector: isParallelSibling,
    resourceType,
    startTime: node.startTime,
    endTime: node.endTime,
    duration: node.duration,
    activeStartTime: node.activeStartTime,
    isErrored: isSpanErrored(node),
    isLastChild: isLastParallelSibling,
    activeConnectors: [...activeConnectors],
    attributes: node.span.attributes || {},
    events: (node.events || []).map((e) => ({
      name: e.event.name,
      timestamp: e.timestamp,
      attributes: e.event.attributes || {},
    })),
  });

  const nextConnectors =
    isParallelSibling &&
    !isLastParallelSibling &&
    !activeConnectors.includes(depth)
      ? [...activeConnectors, depth]
      : activeConnectors;

  const sorted = [...node.children].sort((a, b) => a.startTime - b.startTime);
  const childParallelSiblingIds = getParallelSiblingIds(sorted);
  sorted.forEach((child, index) => {
    flattenNode(
      child,
      result,
      sorted,
      index,
      childParallelSiblingIds,
      nextConnectors,
      depth,
      false,
      resourceType === 'run'
    );
  });
}

export function flattenTrace(trace: Trace): {
  spans: FlatSpan[];
  root: RootNode;
} {
  const { root } = parseTrace(trace);
  const result: FlatSpan[] = [];

  const sorted = [...root.children].sort((a, b) => a.startTime - b.startTime);
  const parallelSiblingIds = getParallelSiblingIds(sorted);
  sorted.forEach((child, index) => {
    flattenNode(
      child,
      result,
      sorted,
      index,
      parallelSiblingIds,
      [],
      0,
      true,
      false
    );
  });

  return { spans: result, root };
}

export function computeTimeMarkers(
  durationMs: number,
  startMs: number = 0
): { label: string; position: number }[] {
  if (durationMs <= 0) return [];

  const intervals = [
    1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 30000,
    60000, 120000, 300000, 600000,
  ];
  let interval = intervals[intervals.length - 1];
  for (const candidate of intervals) {
    if (durationMs / candidate <= 8) {
      interval = candidate;
      break;
    }
  }

  const endMs = startMs + durationMs;
  const firstMarker = Math.ceil(startMs / interval) * interval;

  const markers: { label: string; position: number }[] = [];
  for (let t = firstMarker; t < endMs; t += interval) {
    const position = (t - startMs) / durationMs;
    if (position < 0.02) continue;
    markers.push({
      label: formatDuration(t, true),
      position,
    });
  }
  return markers;
}

export const RESOURCE_COLORS: Record<
  ResourceType,
  {
    bg: string;
    bar: string;
    icon: string;
    errorBar?: string;
  }
> = {
  run: {
    bg: 'var(--ds-blue-200)',
    bar: 'var(--ds-blue-700)',
    icon: 'var(--ds-blue-900)',
  },
  step: {
    bg: 'var(--ds-green-200)',
    bar: 'var(--ds-green-700)',
    icon: 'var(--ds-green-900)',
    errorBar: 'var(--ds-red-700)',
  },
  hook: {
    bg: 'var(--ds-amber-200)',
    bar: 'var(--ds-amber-700)',
    icon: 'var(--ds-amber-900)',
  },
  sleep: {
    bg: 'var(--ds-purple-200)',
    bar: 'var(--ds-purple-700)',
    icon: 'var(--ds-purple-900)',
  },
  default: {
    bg: 'var(--ds-gray-200)',
    bar: 'var(--ds-gray-700)',
    icon: 'var(--ds-gray-900)',
  },
};
