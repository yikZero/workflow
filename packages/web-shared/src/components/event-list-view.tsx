'use client';

import { parseStepName, parseWorkflowName } from '@workflow/utils/parse-name';
import type { Event, Step, WorkflowRun } from '@workflow/world';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Check, ChevronRight, Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import {
  deserializeByteObjects,
  formatDuration,
  tryDeserializeSerializedData,
} from '../lib/utils';
import { Skeleton } from './ui/skeleton';

const BUTTON_RESET_STYLE: React.CSSProperties = {
  appearance: 'none',
  WebkitAppearance: 'none',
  border: 'none',
  background: 'transparent',
  padding: 0,
};
const DOT_PULSE_ANIMATION =
  'workflow-dot-pulse 1.25s cubic-bezier(0, 0, 0.2, 1) infinite';

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function formatEventTime(date: Date): string {
  return (
    date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }) +
    '.' +
    date.getMilliseconds().toString().padStart(3, '0')
  );
}

function formatEventType(eventType: Event['eventType']): string {
  return eventType
    .split('_')
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ──────────────────────────────────────────────────────────────────────────
// Event type → status color (small dot only)
// ──────────────────────────────────────────────────────────────────────────

/** Returns a CSS color using Geist design tokens for the status dot. */
function getStatusDotColor(eventType: string): string {
  // Failed → red
  if (
    eventType === 'step_failed' ||
    eventType === 'run_failed' ||
    eventType === 'workflow_failed'
  ) {
    return 'var(--ds-red-700)';
  }
  // Cancelled → amber
  if (eventType === 'run_cancelled') {
    return 'var(--ds-amber-700)';
  }
  // Retrying → amber
  if (eventType === 'step_retrying') {
    return 'var(--ds-amber-700)';
  }
  // Completed/succeeded → green
  if (
    eventType === 'step_completed' ||
    eventType === 'run_completed' ||
    eventType === 'workflow_completed' ||
    eventType === 'hook_disposed' ||
    eventType === 'wait_completed'
  ) {
    return 'var(--ds-green-700)';
  }
  // Started/running → blue
  if (
    eventType === 'step_started' ||
    eventType === 'run_started' ||
    eventType === 'workflow_started' ||
    eventType === 'hook_received'
  ) {
    return 'var(--ds-blue-700)';
  }
  // Created/pending → gray
  return 'var(--ds-gray-600)';
}

/** Whether this event starts a new correlation lifecycle */
function isLifecycleStart(eventType: string): boolean {
  return (
    eventType === 'step_created' ||
    eventType === 'step_started' ||
    eventType === 'hook_created' ||
    eventType === 'wait_created'
  );
}

/** Whether this event terminates a correlation lifecycle */
function isLifecycleEnd(eventType: string): boolean {
  return (
    eventType === 'step_completed' ||
    eventType === 'step_failed' ||
    eventType === 'hook_disposed' ||
    eventType === 'wait_completed'
  );
}

/** Whether this event is a run-level event (no correlation) */
/**
 * Build a map from correlationId (stepId) → display name using step entities,
 * and parse the workflow name from the run.
 */
function buildNameMaps(
  steps: Step[] | null,
  run: WorkflowRun | null
): {
  correlationNameMap: Map<string, string>;
  workflowName: string | null;
} {
  const correlationNameMap = new Map<string, string>();

  // Map step correlationId (= stepId) → parsed step name
  if (steps) {
    for (const step of steps) {
      const parsed = parseStepName(String(step.stepName));
      correlationNameMap.set(step.stepId, parsed?.shortName ?? step.stepName);
    }
  }

  // Parse workflow name from run
  const workflowName = run?.workflowName
    ? (parseWorkflowName(run.workflowName)?.shortName ?? run.workflowName)
    : null;

  return { correlationNameMap, workflowName };
}

interface DurationInfo {
  /** Time from created → started (ms) */
  queued?: number;
  /** Time from started → completed/failed/cancelled (ms) */
  ran?: number;
}

/**
 * Build a map from correlationId → duration info by diffing
 * created ↔ started (queued) and started ↔ completed/failed/cancelled (ran).
 * Also computes run-level durations under the key '__run__'.
 */
function buildDurationMap(events: Event[]): Map<string, DurationInfo> {
  const createdTimes = new Map<string, number>();
  const startedTimes = new Map<string, number>();
  const durations = new Map<string, DurationInfo>();

  for (const event of events) {
    const ts = new Date(event.createdAt).getTime();
    const key = event.correlationId ?? '__run__';
    const type: string = event.eventType;

    // Track created times (first event for each correlation)
    if (type === 'step_created' || type === 'run_created') {
      createdTimes.set(key, ts);
    }

    // Track started times & compute queued duration
    if (
      type === 'step_started' ||
      type === 'run_started' ||
      type === 'workflow_started'
    ) {
      startedTimes.set(key, ts);
      // If no explicit created event was seen, use the started time as created
      if (!createdTimes.has(key)) {
        createdTimes.set(key, ts);
      }
      const createdAt = createdTimes.get(key);
      const info = durations.get(key) ?? {};
      if (createdAt !== undefined) {
        info.queued = ts - createdAt;
      }
      durations.set(key, info);
    }

    // Compute ran duration on terminal events
    if (
      type === 'step_completed' ||
      type === 'step_failed' ||
      type === 'run_completed' ||
      type === 'run_failed' ||
      type === 'run_cancelled' ||
      type === 'workflow_completed' ||
      type === 'workflow_failed' ||
      type === 'wait_completed' ||
      type === 'hook_disposed'
    ) {
      const startedAt = startedTimes.get(key);
      const info = durations.get(key) ?? {};
      if (startedAt !== undefined) {
        info.ran = ts - startedAt;
      }
      durations.set(key, info);
    }
  }

  return durations;
}

function isRunLevel(eventType: string): boolean {
  return (
    eventType === 'run_created' ||
    eventType === 'run_started' ||
    eventType === 'run_completed' ||
    eventType === 'run_failed' ||
    eventType === 'run_cancelled' ||
    eventType === 'workflow_started' ||
    eventType === 'workflow_completed' ||
    eventType === 'workflow_failed'
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tree structure computation
// ──────────────────────────────────────────────────────────────────────────

interface EventTreeNode {
  event: Event;
  /** The lane index this event's correlation occupies (-1 for run-level) */
  lane: number;
  /** Which lanes have active vertical lines at this row */
  activeLanes: Set<number>;
  /** Whether this event starts a new branch (horizontal line from root) */
  isBranchStart: boolean;
  /** Whether this event ends a branch */
  isBranchEnd: boolean;
}

function buildEventTree(events: Event[]): EventTreeNode[] {
  const correlationToLane = new Map<string, number>();
  const activeLanes = new Set<number>();
  const reusableLanes: number[] = [];
  let nextLane = 0;

  const nodes: EventTreeNode[] = [];

  // Pre-compute the last event index for each correlation so we can
  // terminate lanes that never receive a proper lifecycle-end event
  // (e.g. hook_received with no subsequent hook_disposed because the run failed).
  const lastEventIndexByCorrelation = new Map<string, number>();
  for (let i = events.length - 1; i >= 0; i--) {
    const corrId = events[i].correlationId;
    if (corrId && !lastEventIndexByCorrelation.has(corrId)) {
      lastEventIndexByCorrelation.set(corrId, i);
    }
  }

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const corrId = event.correlationId;
    const isRun = isRunLevel(event.eventType);

    let lane = -1;
    let isBranchStart = false;
    let isBranchEnd = false;

    if (!isRun && corrId) {
      // Start a lane on lifecycle-start events, but only if this
      // correlation doesn't already have a lane (step_started should
      // not create a second lane if step_created already opened one).
      if (isLifecycleStart(event.eventType) && !correlationToLane.has(corrId)) {
        if (reusableLanes.length > 0) {
          let smallestIdx = 0;
          for (let i = 1; i < reusableLanes.length; i++) {
            if (reusableLanes[i] < reusableLanes[smallestIdx]) {
              smallestIdx = i;
            }
          }
          lane = reusableLanes[smallestIdx];
          reusableLanes.splice(smallestIdx, 1);
        } else {
          lane = nextLane++;
        }
        correlationToLane.set(corrId, lane);
        activeLanes.add(lane);
        isBranchStart = true;
      } else {
        lane = correlationToLane.get(corrId) ?? -1;
        if (isLifecycleEnd(event.eventType) && lane >= 0) {
          isBranchEnd = true;
        }
      }

      // If this is the last event for this correlation and it wasn't
      // already marked as a branch end, terminate the lane here to
      // avoid an orphan gutter line extending past the last event.
      if (
        !isBranchEnd &&
        lane >= 0 &&
        lastEventIndexByCorrelation.get(corrId) === i
      ) {
        isBranchEnd = true;
      }
    }

    nodes.push({
      event,
      lane,
      activeLanes: new Set(activeLanes),
      isBranchStart,
      isBranchEnd,
    });

    if (isBranchEnd && lane >= 0) {
      if (corrId) {
        correlationToLane.delete(corrId);
      }
      activeLanes.delete(lane);
      reusableLanes.push(lane);
    }
  }

  return nodes;
}

// ──────────────────────────────────────────────────────────────────────────
// Tree gutter — draws vertical/horizontal lines for a single row slice
// ──────────────────────────────────────────────────────────────────────────

const LANE_WIDTH = 16;
const LINE_COLOR = 'var(--ds-gray-400)';
const LINE_COLOR_DIM = 'var(--ds-gray-200)';
const ROOT_LINE_COLOR = 'var(--ds-gray-500)';

function TreeGutter({
  node,
  totalLanes,
  isFirst,
  isLast,
  selectedLane,
  statusDotColor,
  pulse = false,
  continuationOnly = false,
}: {
  node: EventTreeNode;
  totalLanes: number;
  isFirst: boolean;
  isLast: boolean;
  selectedLane?: number;
  /** CSS color for the status dot (Geist design token) */
  statusDotColor?: string;
  /** Whether dots should pulse (group is selected and this row belongs to it) */
  pulse?: boolean;
  continuationOnly?: boolean;
}) {
  const gutterWidth = 20 + totalLanes * LANE_WIDTH;
  const hasSelection = selectedLane !== undefined;

  // Root line never dims
  const rootColor = ROOT_LINE_COLOR;
  const laneColor = (laneIdx: number): string => {
    if (!hasSelection) return LINE_COLOR;
    return laneIdx === selectedLane ? ROOT_LINE_COLOR : LINE_COLOR_DIM;
  };
  const thisLaneColor = node.lane >= 0 ? laneColor(node.lane) : LINE_COLOR;

  return (
    <div
      className="relative flex-shrink-0 self-stretch"
      style={{
        width: gutterWidth,
        minHeight: continuationOnly ? 0 : undefined,
      }}
    >
      {/* Root vertical line (leftmost) */}
      <div
        style={{
          position: 'absolute',
          left: 8,
          top: continuationOnly ? 0 : isFirst ? '50%' : 0,
          bottom: continuationOnly ? 0 : isLast ? '50%' : 0,
          width: 2,
          backgroundColor: rootColor,
          transition: 'background-color 150ms',
        }}
      />

      {!continuationOnly && (
        <>
          {/* Root dot on run-level events */}
          {node.lane === -1 && (
            <div
              style={{
                position: 'absolute',
                left: 5,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 8,
                height: 8,
                zIndex: 2,
              }}
            >
              {pulse && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    backgroundColor: statusDotColor,
                    opacity: 0.75,
                    animation: DOT_PULSE_ANIMATION,
                  }}
                />
              )}
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  backgroundColor: statusDotColor,
                }}
              />
            </div>
          )}

          {/* Horizontal branch from root to this event's lane */}
          {node.isBranchStart && node.lane >= 0 && (
            <div
              style={{
                position: 'absolute',
                left: 9,
                top: '50%',
                width: 11 + node.lane * LANE_WIDTH,
                height: 2,
                backgroundColor: thisLaneColor,
                transition: 'background-color 150ms',
                zIndex: hasSelection && node.lane === selectedLane ? 1 : 0,
              }}
            />
          )}

          {/* Horizontal connector from lane line to event content */}
          {node.lane >= 0 && (
            <div
              style={{
                position: 'absolute',
                left: 20 + node.lane * LANE_WIDTH,
                top: '50%',
                width: gutterWidth - (20 + node.lane * LANE_WIDTH),
                height: 2,
                backgroundColor: thisLaneColor,
                transition: 'background-color 150ms',
                zIndex: hasSelection && node.lane === selectedLane ? 1 : 0,
              }}
            />
          )}

          {/* Dot at the junction */}
          {node.lane >= 0 && (
            <div
              style={{
                position: 'absolute',
                left: 20 + node.lane * LANE_WIDTH - 2,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 6,
                height: 6,
                zIndex: 2,
                opacity: hasSelection && node.lane !== selectedLane ? 0.3 : 1,
                transition: 'opacity 150ms',
              }}
            >
              {pulse && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    backgroundColor: statusDotColor,
                    opacity: 0.75,
                    animation: DOT_PULSE_ANIMATION,
                  }}
                />
              )}
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  backgroundColor: statusDotColor,
                }}
              />
            </div>
          )}
        </>
      )}

      {/* Lane vertical lines for active correlations */}
      {Array.from(node.activeLanes)
        .filter((laneIdx) => {
          if (!continuationOnly) return true;
          // In continuation mode (expanded details), only show this node's lane
          // — and only if it's NOT the last event in the group (nothing to connect to below)
          if (laneIdx === node.lane && node.isBranchEnd) return false;
          if (laneIdx !== node.lane) return false;
          return true;
        })
        .map((laneIdx) => {
          const x = 20 + laneIdx * LANE_WIDTH;
          const isThisLane = laneIdx === node.lane;

          let top: string | number = 0;
          let bottom: string | number = 0;
          if (!continuationOnly) {
            if (isThisLane && node.isBranchStart) {
              top = '50%';
            }
            if (isThisLane && node.isBranchEnd) {
              bottom = '50%';
            }
          }

          const isSelected = hasSelection && laneIdx === selectedLane;
          return (
            <div
              key={laneIdx}
              style={{
                position: 'absolute',
                left: x,
                top,
                bottom,
                width: 2,
                backgroundColor: laneColor(laneIdx),
                transition: 'background-color 150ms',
                zIndex: isSelected ? 1 : 0,
              }}
            />
          );
        })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Copyable cell — shows a copy button on hover
// ──────────────────────────────────────────────────────────────────────────

function CopyableCell({
  value,
  className,
}: {
  value: string;
  className?: string;
}): ReactNode {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
    [value]
  );

  return (
    <div
      className={`group/copy flex items-center gap-1 flex-1 min-w-0 px-4 ${className ?? ''}`}
    >
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {value || '-'}
      </span>
      {value ? (
        <button
          type="button"
          onClick={handleCopy}
          className="flex-shrink-0 opacity-0 group-hover/copy:opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--ds-gray-alpha-200)]"
          style={BUTTON_RESET_STYLE}
          aria-label={`Copy ${value}`}
        >
          {copied ? (
            <Check
              className="h-3 w-3"
              style={{ color: 'var(--ds-green-700)' }}
            />
          ) : (
            <Copy className="h-3 w-3" style={{ color: 'var(--ds-gray-700)' }} />
          )}
        </button>
      ) : null}
    </div>
  );
}

/** Recursively parse stringified JSON values so escaped slashes / quotes are cleaned up */
function deepParseJson(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      try {
        return deepParseJson(JSON.parse(trimmed));
      } catch {
        return value;
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(deepParseJson);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = deepParseJson(v);
    }
    return result;
  }
  return value;
}

function PayloadBlock({ data }: { data: unknown }): ReactNode {
  const [copied, setCopied] = useState(false);

  const formatted = useMemo(() => {
    const cleaned = deepParseJson(
      deserializeByteObjects(tryDeserializeSerializedData(data))
    );
    return JSON.stringify(cleaned, null, 2);
  }, [data]);

  const handleCopy = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(formatted).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
    [formatted]
  );

  return (
    <div className="relative group/payload">
      <pre
        className="text-[11px] overflow-x-auto p-2"
        style={{ color: 'var(--ds-gray-1000)' }}
      >
        <code>{formatted}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute bottom-2 right-2 opacity-0 group-hover/payload:opacity-100 transition-opacity flex items-center gap-1 px-2 py-1 rounded-md text-xs hover:bg-[var(--ds-gray-alpha-200)]"
        style={{ ...BUTTON_RESET_STYLE, color: 'var(--ds-gray-700)' }}
        aria-label="Copy payload"
      >
        {copied ? (
          <>
            <Check
              className="h-3 w-3"
              style={{ color: 'var(--ds-green-700)' }}
            />
            <span style={{ color: 'var(--ds-green-700)' }}>Copied</span>
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" />
            <span>Copy</span>
          </>
        )}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Event row
// ──────────────────────────────────────────────────────────────────────────

interface EventsListProps {
  events: Event[] | null;
  steps?: Step[] | null;
  run?: WorkflowRun | null;
  onLoadEventData?: (event: Event) => Promise<unknown | null>;
}

function EventRow({
  event,
  node,
  totalLanes,
  isFirst,
  isLast,
  activeGroupKey,
  selectedGroupKey,
  correlationNameMap,
  workflowName,
  durationMap,
  onSelectGroup,
  onHoverGroup,
  onLoadEventData,
}: {
  event: Event;
  node: EventTreeNode;
  totalLanes: number;
  isFirst: boolean;
  isLast: boolean;
  /** The currently active group (from click or hover). undefined = no focus. */
  activeGroupKey?: string;
  /** The clicked/locked selection (needed for toggle logic). */
  selectedGroupKey?: string;
  /** Map from correlationId → display name */
  correlationNameMap: Map<string, string>;
  /** Workflow name for run-level events */
  workflowName: string | null;
  /** Map from correlationId → duration info */
  durationMap: Map<string, DurationInfo>;
  onSelectGroup: (groupKey: string | undefined) => void;
  onHoverGroup: (groupKey: string | undefined) => void;
  onLoadEventData?: (event: Event) => Promise<unknown | null>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedEventData, setLoadedEventData] = useState<unknown | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasAttemptedLoad, setHasAttemptedLoad] = useState(false);

  const rowGroupKey =
    event.correlationId ??
    (isRunLevel(event.eventType) ? '__run__' : undefined);

  // Collapse when a different group gets selected
  useEffect(() => {
    if (selectedGroupKey !== undefined && selectedGroupKey !== rowGroupKey) {
      setIsExpanded(false);
    }
  }, [selectedGroupKey, rowGroupKey]);

  const statusDotColor = getStatusDotColor(event.eventType);
  const createdAt = new Date(event.createdAt);
  const hasExistingEventData = 'eventData' in event && event.eventData != null;
  const isRun = isRunLevel(event.eventType);
  const eventName = isRun
    ? (workflowName ?? '-')
    : event.correlationId
      ? (correlationNameMap.get(event.correlationId) ?? '-')
      : '-';

  const durationKey = event.correlationId ?? (isRun ? '__run__' : '');
  const durationInfo = durationKey ? durationMap.get(durationKey) : undefined;

  const hasActive = activeGroupKey !== undefined;
  const isRelated = rowGroupKey !== undefined && rowGroupKey === activeGroupKey;
  const isDimmed = hasActive && !isRelated;
  const isPulsing = hasActive && isRelated;
  const highlightedLane = isRelated && node.lane >= 0 ? node.lane : undefined;

  const loadEventDetails = useCallback(async () => {
    if (
      loadedEventData !== null ||
      hasExistingEventData ||
      !event.correlationId
    ) {
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      if (!onLoadEventData) {
        setLoadError('Event details unavailable');
        return;
      }
      const eventData = await onLoadEventData(event);
      if (eventData !== null && eventData !== undefined) {
        setLoadedEventData(eventData);
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load event details'
      );
    } finally {
      setIsLoading(false);
      setHasAttemptedLoad(true);
    }
  }, [
    event.correlationId,
    loadedEventData,
    hasExistingEventData,
    onLoadEventData,
  ]);

  const handleExpandToggle = useCallback(
    (e: ReactMouseEvent) => {
      e.stopPropagation();
      const newExpanded = !isExpanded;
      setIsExpanded(newExpanded);
      if (newExpanded && loadedEventData === null && !hasExistingEventData) {
        loadEventDetails();
      }
    },
    [isExpanded, loadedEventData, hasExistingEventData, loadEventDetails]
  );

  const handleRowClick = useCallback(() => {
    // Toggle selection: click same group deselects, click different group selects
    if (selectedGroupKey === rowGroupKey) {
      onSelectGroup(undefined);
    } else {
      onSelectGroup(rowGroupKey);
    }
  }, [selectedGroupKey, rowGroupKey, onSelectGroup]);

  const eventData = hasExistingEventData
    ? (event as Event & { eventData: unknown }).eventData
    : loadedEventData;

  const contentOpacity = isDimmed ? 0.3 : 1;

  return (
    <div
      data-event-id={event.eventId}
      onMouseEnter={() => onHoverGroup(rowGroupKey)}
      onMouseLeave={() => onHoverGroup(undefined)}
    >
      {/* Row */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleRowClick();
        }}
        className="w-full text-left flex items-center gap-0 text-sm hover:bg-[var(--ds-gray-alpha-100)] transition-colors cursor-pointer"
        style={{ minHeight: 40 }}
      >
        {/* Tree gutter — never dimmed by row opacity */}
        <TreeGutter
          node={node}
          totalLanes={totalLanes}
          isFirst={isFirst}
          isLast={isLast && !isExpanded}
          selectedLane={highlightedLane}
          statusDotColor={statusDotColor}
          pulse={isPulsing}
        />

        {/* Content area — dims when unrelated */}
        <div
          className="flex items-center flex-1 min-w-0"
          style={{ opacity: contentOpacity, transition: 'opacity 150ms' }}
        >
          {/* Expand chevron button */}
          <button
            type="button"
            onClick={handleExpandToggle}
            className="flex items-center justify-center w-5 h-5 flex-shrink-0 rounded hover:bg-[var(--ds-gray-alpha-200)] transition-colors"
            style={BUTTON_RESET_STYLE}
            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
          >
            <ChevronRight
              className="h-3 w-3 transition-transform"
              style={{
                color: 'var(--ds-gray-700)',
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              }}
            />
          </button>

          {/* Time */}
          <div
            className="text-xs tabular-nums flex-1 min-w-0 px-4"
            style={{ color: 'var(--ds-gray-900)' }}
          >
            {formatEventTime(createdAt)}
          </div>

          {/* Event Type */}
          <div className="text-xs font-medium flex-1 min-w-0 px-4">
            <span
              className="inline-flex items-center gap-1.5"
              style={{ color: 'var(--ds-gray-900)' }}
            >
              <span
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  width: 6,
                  height: 6,
                  flexShrink: 0,
                }}
              >
                {isPulsing && (
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      backgroundColor: statusDotColor,
                      opacity: 0.75,
                      animation: DOT_PULSE_ANIMATION,
                    }}
                  />
                )}
                <span
                  style={{
                    position: 'relative',
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    backgroundColor: statusDotColor,
                  }}
                />
              </span>
              {formatEventType(event.eventType)}
            </span>
          </div>

          {/* Name */}
          <div
            className="text-xs flex-1 min-w-0 px-4 overflow-hidden text-ellipsis whitespace-nowrap"
            title={eventName !== '-' ? eventName : undefined}
          >
            {eventName}
          </div>

          {/* Correlation ID */}
          <CopyableCell
            value={event.correlationId || ''}
            className="font-mono text-xs"
          />

          {/* Event ID */}
          <CopyableCell value={event.eventId} className="font-mono text-xs" />
        </div>
      </div>

      {/* Expanded details — tree lines continue through this area */}
      {isExpanded && (
        <div className="flex">
          {/* Continuation gutter — keeps lane lines flowing */}
          <TreeGutter
            node={node}
            totalLanes={totalLanes}
            isFirst={false}
            isLast={isLast}
            selectedLane={highlightedLane}
            continuationOnly
          />
          {/* Spacer for chevron column */}
          <div className="w-5 flex-shrink-0" />
          <div
            className="flex-1 my-1.5 mr-3 ml-2 py-2 rounded-md border overflow-hidden"
            style={{
              borderColor: 'var(--ds-gray-alpha-200)',
              opacity: contentOpacity,
              transition: 'opacity 150ms',
            }}
          >
            {/* Duration info */}
            {(durationInfo?.queued !== undefined ||
              durationInfo?.ran !== undefined) && (
              <div
                className="px-2 pb-1.5 text-xs flex gap-3"
                style={{ color: 'var(--ds-gray-900)' }}
              >
                {durationInfo.queued !== undefined &&
                  durationInfo.queued > 0 && (
                    <span>
                      Queued for{' '}
                      <span className="font-mono tabular-nums">
                        {formatDuration(durationInfo.queued)}
                      </span>
                    </span>
                  )}
                {durationInfo.ran !== undefined && (
                  <span>
                    Ran for{' '}
                    <span className="font-mono tabular-nums">
                      {formatDuration(durationInfo.ran)}
                    </span>
                  </span>
                )}
              </div>
            )}

            {/* Payload */}
            {eventData != null ? (
              <PayloadBlock data={eventData} />
            ) : loadError ? (
              <div
                className="rounded-md border p-3 text-xs"
                style={{
                  borderColor: 'var(--ds-red-400)',
                  backgroundColor: 'var(--ds-red-100)',
                  color: 'var(--ds-red-900)',
                }}
              >
                {loadError}
              </div>
            ) : isLoading ||
              (!hasExistingEventData &&
                !hasAttemptedLoad &&
                event.correlationId) ? (
              <div className="flex flex-col gap-2 p-3">
                <Skeleton className="h-3" style={{ width: '75%' }} />
                <Skeleton className="h-3" style={{ width: '50%' }} />
                <Skeleton className="h-3" style={{ width: '60%' }} />
              </div>
            ) : (
              <div
                className="p-2 text-xs"
                style={{ color: 'var(--ds-gray-900)' }}
              >
                No data
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────

export function EventListView({
  events,
  steps,
  run,
  onLoadEventData,
}: EventsListProps) {
  const sortedEvents = useMemo(() => {
    if (!events || events.length === 0) return [];
    return [...events].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [events]);

  const treeNodes = useMemo(() => buildEventTree(sortedEvents), [sortedEvents]);

  const { correlationNameMap, workflowName } = useMemo(
    () => buildNameMaps(steps ?? null, run ?? null),
    [steps, run]
  );

  const durationMap = useMemo(
    () => buildDurationMap(sortedEvents),
    [sortedEvents]
  );

  const totalLanes = useMemo(() => {
    let max = 0;
    for (const node of treeNodes) {
      for (const lane of node.activeLanes) {
        max = Math.max(max, lane + 1);
      }
    }
    return max;
  }, [treeNodes]);

  const [selectedGroupKey, setSelectedGroupKey] = useState<string | undefined>(
    undefined
  );
  const [hoveredGroupKey, setHoveredGroupKey] = useState<string | undefined>(
    undefined
  );
  const onSelectGroup = useCallback((groupKey: string | undefined) => {
    setSelectedGroupKey(groupKey);
  }, []);
  const onHoverGroup = useCallback((groupKey: string | undefined) => {
    setHoveredGroupKey(groupKey);
  }, []);

  const activeGroupKey = selectedGroupKey ?? hoveredGroupKey;

  const [searchQuery, setSearchQuery] = useState('');
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const searchIndex = useMemo(() => {
    const entries: {
      text: string;
      groupKey?: string;
      eventId: string;
      index: number;
    }[] = [];
    for (let i = 0; i < treeNodes.length; i++) {
      const ev = treeNodes[i].event;
      entries.push({
        text: [ev.eventId, ev.correlationId ?? ''].join(' ').toLowerCase(),
        groupKey:
          ev.correlationId ??
          (isRunLevel(ev.eventType) ? '__run__' : undefined),
        eventId: ev.eventId,
        index: i,
      });
    }
    return entries;
  }, [treeNodes]);

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      setSelectedGroupKey(undefined);
      return;
    }
    const match = searchIndex.find((entry) => entry.text.includes(q));
    if (match) {
      setSelectedGroupKey(match.groupKey);
      virtuosoRef.current?.scrollToIndex({
        index: match.index,
        align: 'center',
        behavior: 'smooth',
      });
    }
  }, [searchQuery, searchIndex]);

  if (!events || events.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-sm"
        style={{ color: 'var(--ds-gray-700)' }}
      >
        No events found
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <style>{`@keyframes workflow-dot-pulse{0%{transform:scale(1);opacity:.7}70%,100%{transform:scale(2.2);opacity:0}}`}</style>
      {/* Search bar */}
      <div style={{ padding: 6, backgroundColor: 'var(--ds-background-100)' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 6,
            boxShadow: '0 0 0 1px var(--ds-gray-alpha-400)',
            background: 'var(--ds-background-100)',
            height: 40,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ds-gray-800)',
              flexShrink: 0,
            }}
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              focusable="false"
            >
              <circle
                cx="7"
                cy="7"
                r="4.5"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M11.5 11.5L14 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <input
            type="search"
            placeholder="Search by event ID or correlation ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              marginLeft: -16,
              paddingInline: 12,
              fontFamily: 'inherit',
              fontSize: 14,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              height: 40,
              width: '100%',
            }}
          />
        </label>
      </div>

      {/* Header */}
      <div
        className="flex items-center gap-0 text-sm font-medium h-10 border-b flex-shrink-0"
        style={{
          borderColor: 'var(--ds-gray-alpha-200)',
          color: 'var(--ds-gray-900)',
          backgroundColor: 'var(--ds-background-100)',
        }}
      >
        <div
          className="flex-shrink-0"
          style={{ width: 20 + totalLanes * LANE_WIDTH }}
        />
        <div className="w-5 flex-shrink-0" />
        <div className="flex-1 min-w-0 px-4">Time</div>
        <div className="flex-1 min-w-0 px-4">Event Type</div>
        <div className="flex-1 min-w-0 px-4">Name</div>
        <div className="flex-1 min-w-0 px-4">Correlation ID</div>
        <div className="flex-1 min-w-0 px-4">Event ID</div>
      </div>

      {/* Virtualized event rows */}
      <Virtuoso
        ref={virtuosoRef}
        totalCount={treeNodes.length}
        overscan={200}
        defaultItemHeight={40}
        itemContent={(index) => {
          const node = treeNodes[index];
          return (
            <EventRow
              event={node.event}
              node={node}
              totalLanes={totalLanes}
              isFirst={index === 0}
              isLast={index === treeNodes.length - 1}
              activeGroupKey={activeGroupKey}
              selectedGroupKey={selectedGroupKey}
              correlationNameMap={correlationNameMap}
              workflowName={workflowName}
              durationMap={durationMap}
              onSelectGroup={onSelectGroup}
              onHoverGroup={onHoverGroup}
              onLoadEventData={onLoadEventData}
            />
          );
        }}
        components={{
          Footer: () => (
            <div
              className="mt-4 pt-3 border-t text-xs px-3"
              style={{
                borderColor: 'var(--ds-gray-alpha-200)',
                color: 'var(--ds-gray-900)',
              }}
            >
              {sortedEvents.length} event
              {sortedEvents.length !== 1 ? 's' : ''} total
            </div>
          ),
        }}
        style={{ flex: 1, minHeight: 0 }}
      />
    </div>
  );
}
