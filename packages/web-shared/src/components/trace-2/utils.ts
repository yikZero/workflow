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

function isRunSpanRunning(node: SpanNode): boolean {
  if (getResourceType(node) !== 'run') return false;
  return (
    !hasSpanEvent(node, 'run_completed') &&
    !hasSpanEvent(node, 'run_failed') &&
    !hasSpanEvent(node, 'run_cancelled')
  );
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
  parentIndentsChildren: boolean
): void {
  const isParallelSibling = parallelSiblingIds.has(node.span.spanId);
  const shouldIndentFromParent =
    parentIsRoot || parentIndentsChildren || isParallelSibling;
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
    isRunning: isRunSpanRunning(node),
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
      resourceType === 'run' || resourceType === 'hook'
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

// ─── Time Compression ──────────────────────────────────────────────────
// Compresses idle regions (where only hooks/runs are executing, no steps or
// sleeps) so that step bars are more visible relative to long-running hooks.

interface TimeSegment {
  realStart: number;
  realEnd: number;
  visualStart: number;
  visualEnd: number;
  compressed: boolean;
}

export interface TimeCompression {
  segments: TimeSegment[];
  toVisual: (realTime: number) => number;
  toReal: (visualFraction: number) => number;
  breakPoints: number[];
  isCompressed: boolean;
}

const COMPRESSION_RATIO = 0.15;
const HOOK_COMPRESSION_RATIO = 0.02;
const COMPRESSION_THRESHOLD = 5;
const ACTIVE_PADDING_MS = 500;

function mergeIntervals(
  intervals: { start: number; end: number }[]
): { start: number; end: number }[] {
  if (intervals.length === 0) return [];
  intervals.sort((a, b) => a.start - b.start);
  const merged = [{ ...intervals[0] }];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    if (intervals[i].start <= last.end) {
      last.end = Math.max(last.end, intervals[i].end);
    } else {
      merged.push({ ...intervals[i] });
    }
  }
  return merged;
}

export function buildTimeCompression(
  spans: FlatSpan[],
  viewStart: number,
  viewEnd: number,
  expandedHookIds?: Set<string>
): TimeCompression {
  const viewDuration = viewEnd - viewStart;

  const identity: TimeCompression = {
    segments: [],
    toVisual(realTime: number): number {
      if (viewDuration <= 0) return 0;
      return Math.max(0, Math.min(1, (realTime - viewStart) / viewDuration));
    },
    toReal(visualFraction: number): number {
      return viewStart + visualFraction * viewDuration;
    },
    breakPoints: [],
    isCompressed: false,
  };

  if (viewDuration <= 0) return identity;

  const hasCollapsedHooks =
    expandedHookIds != null &&
    spans.some(
      (s) => s.resourceType === 'hook' && !expandedHookIds.has(s.spanId)
    );

  const compressionRatio = hasCollapsedHooks
    ? HOOK_COMPRESSION_RATIO
    : COMPRESSION_RATIO;

  const rawIntervals: { start: number; end: number }[] = [];
  for (const span of spans) {
    const isActiveType =
      span.resourceType === 'step' || span.resourceType === 'sleep';
    const isExpandedHook =
      span.resourceType === 'hook' && expandedHookIds?.has(span.spanId);
    if (!isActiveType && !isExpandedHook) continue;
    if (span.endTime <= viewStart || span.startTime >= viewEnd) continue;
    rawIntervals.push({
      start: Math.max(span.startTime - ACTIVE_PADDING_MS, viewStart),
      end: Math.min(span.endTime + ACTIVE_PADDING_MS, viewEnd),
    });
  }

  if (rawIntervals.length === 0) return identity;

  const merged = mergeIntervals(rawIntervals);

  let totalActive = 0;
  let totalIdle = 0;
  let cursor = viewStart;
  for (const interval of merged) {
    if (interval.start > cursor) totalIdle += interval.start - cursor;
    totalActive += interval.end - interval.start;
    cursor = interval.end;
  }
  if (cursor < viewEnd) totalIdle += viewEnd - cursor;

  if (hasCollapsedHooks) {
    if (totalActive <= 0 || totalIdle <= 0) return identity;
  } else {
    if (totalActive <= 0 || totalIdle / totalActive < COMPRESSION_THRESHOLD)
      return identity;
  }

  const segments: TimeSegment[] = [];
  let visualCursor = 0;
  cursor = viewStart;

  for (const interval of merged) {
    if (interval.start > cursor) {
      const realDur = interval.start - cursor;
      const visualDur = realDur * compressionRatio;
      segments.push({
        realStart: cursor,
        realEnd: interval.start,
        visualStart: visualCursor,
        visualEnd: visualCursor + visualDur,
        compressed: true,
      });
      visualCursor += visualDur;
    }
    const realDur = interval.end - interval.start;
    segments.push({
      realStart: interval.start,
      realEnd: interval.end,
      visualStart: visualCursor,
      visualEnd: visualCursor + realDur,
      compressed: false,
    });
    visualCursor += realDur;
    cursor = interval.end;
  }

  if (cursor < viewEnd) {
    const realDur = viewEnd - cursor;
    const visualDur = realDur * compressionRatio;
    segments.push({
      realStart: cursor,
      realEnd: viewEnd,
      visualStart: visualCursor,
      visualEnd: visualCursor + visualDur,
      compressed: true,
    });
    visualCursor += visualDur;
  }

  const totalVisual = visualCursor;
  if (totalVisual <= 0) return identity;

  const breakPoints: number[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i].compressed !== segments[i + 1].compressed) {
      const position = segments[i].visualEnd / totalVisual;
      if (position > 0.01 && position < 0.99) {
        breakPoints.push(position);
      }
    }
  }

  const segs = segments;

  function toVisual(realTime: number): number {
    if (realTime <= viewStart) return 0;
    if (realTime >= viewEnd) return 1;

    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].realEnd <= realTime) lo = mid + 1;
      else hi = mid;
    }

    const seg = segs[lo];
    const realDur = seg.realEnd - seg.realStart;
    if (realDur <= 0) return seg.visualStart / totalVisual;

    const fraction = (realTime - seg.realStart) / realDur;
    return (
      (seg.visualStart + fraction * (seg.visualEnd - seg.visualStart)) /
      totalVisual
    );
  }

  function toReal(visualFraction: number): number {
    if (visualFraction <= 0) return viewStart;
    if (visualFraction >= 1) return viewEnd;

    const visualTime = visualFraction * totalVisual;
    let lo = 0;
    let hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].visualEnd <= visualTime) lo = mid + 1;
      else hi = mid;
    }

    const seg = segs[lo];
    const visualDur = seg.visualEnd - seg.visualStart;
    if (visualDur <= 0) return seg.realStart;

    const fraction = (visualTime - seg.visualStart) / visualDur;
    return seg.realStart + fraction * (seg.realEnd - seg.realStart);
  }

  return { segments, toVisual, toReal, breakPoints, isCompressed: true };
}

export function computeCompressedTimeMarkers(
  compression: TimeCompression,
  viewStart: number,
  viewEnd: number,
  rootStart: number
): { label: string; position: number }[] {
  if (!compression.isCompressed) {
    return computeTimeMarkers(viewEnd - viewStart, viewStart - rootStart);
  }

  const durationMs = viewEnd - viewStart;
  if (durationMs <= 0) return [];

  const intervals = [
    1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 30000,
    60000, 120000, 300000, 600000,
  ];
  let interval = intervals[intervals.length - 1];
  for (const candidate of intervals) {
    if (durationMs / candidate <= 10) {
      interval = candidate;
      break;
    }
  }

  const startMs = viewStart - rootStart;
  const endMs = startMs + durationMs;
  const firstMarker = Math.ceil(startMs / interval) * interval;

  const candidates: { label: string; position: number }[] = [];
  for (let t = firstMarker; t < endMs; t += interval) {
    const realTime = rootStart + t;
    const position = compression.toVisual(realTime);
    if (position < 0.02 || position > 0.98) continue;
    candidates.push({ label: formatDuration(t, true), position });
  }

  const MIN_GAP = 0.1;
  const filtered: typeof candidates = [];
  for (const m of candidates) {
    const prev = filtered[filtered.length - 1];
    if (!prev || m.position - prev.position >= MIN_GAP) {
      filtered.push(m);
    }
  }

  return filtered;
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
