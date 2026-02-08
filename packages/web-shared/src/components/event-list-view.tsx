'use client';

import { parseStepName, parseWorkflowName } from '@workflow/utils/parse-name';
import type { Event, Step, WorkflowRun } from '@workflow/world';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Check, ChevronRight, Copy, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { deserializeByteObjects, formatDuration } from '../lib/utils';

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

/** Returns a Tailwind bg class matching the runs table StatusBadge colors. */
function getStatusDotClass(eventType: Event['eventType']): string {
  // Failed → red
  if (eventType === 'step_failed' || eventType === 'run_failed') {
    return 'bg-red-500';
  }
  // Cancelled → yellow
  if (eventType === 'run_cancelled') {
    return 'bg-yellow-500';
  }
  // Retrying → yellow (similar to cancelled — warning state)
  if (eventType === 'step_retrying') {
    return 'bg-yellow-500';
  }
  // Completed/succeeded → emerald
  if (
    eventType === 'step_completed' ||
    eventType === 'run_completed' ||
    eventType === 'hook_disposed' ||
    eventType === 'wait_completed'
  ) {
    return 'bg-emerald-500';
  }
  // Started/running → blue
  if (
    eventType === 'step_started' ||
    eventType === 'run_started' ||
    eventType === 'hook_received'
  ) {
    return 'bg-blue-500';
  }
  // Created/pending → gray
  return 'bg-gray-400';
}

/** Whether this event starts a new correlation lifecycle */
function isLifecycleStart(eventType: string): boolean {
  return (
    eventType === 'step_created' ||
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

/**
 * Build a map from correlationId → execution duration (ms) by diffing
 * started ↔ completed/failed/cancelled event timestamps.
 * Also computes run-level duration under the key '__run__'.
 */
function buildDurationMap(events: Event[]): Map<string, number> {
  const startedTimes = new Map<string, number>();
  const durations = new Map<string, number>();

  for (const event of events) {
    const ts = new Date(event.createdAt).getTime();
    const key = event.correlationId ?? '__run__';

    // Track started times
    if (
      event.eventType === 'step_started' ||
      event.eventType === 'run_started'
    ) {
      startedTimes.set(key, ts);
    }

    // Compute duration on terminal events
    if (
      event.eventType === 'step_completed' ||
      event.eventType === 'step_failed' ||
      event.eventType === 'run_completed' ||
      event.eventType === 'run_failed' ||
      event.eventType === 'run_cancelled' ||
      event.eventType === 'wait_completed' ||
      event.eventType === 'hook_disposed'
    ) {
      const startedAt = startedTimes.get(key);
      if (startedAt !== undefined) {
        durations.set(key, ts - startedAt);
      }
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
    eventType === 'run_cancelled'
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
  let nextLane = 0;

  const nodes: EventTreeNode[] = [];

  for (const event of events) {
    const corrId = event.correlationId;
    const isRun = isRunLevel(event.eventType);

    let lane = -1;
    let isBranchStart = false;
    let isBranchEnd = false;

    if (!isRun && corrId) {
      if (isLifecycleStart(event.eventType)) {
        lane = nextLane++;
        correlationToLane.set(corrId, lane);
        activeLanes.add(lane);
        isBranchStart = true;
      } else {
        lane = correlationToLane.get(corrId) ?? -1;
        if (isLifecycleEnd(event.eventType) && lane >= 0) {
          isBranchEnd = true;
        }
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
      activeLanes.delete(lane);
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
  statusDotClass,
  pulse = false,
  /** When true, only draw lane continuation lines (for expanded detail areas) */
  continuationOnly = false,
}: {
  node: EventTreeNode;
  totalLanes: number;
  isFirst: boolean;
  isLast: boolean;
  selectedLane?: number;
  /** Tailwind bg class for the status color dot */
  statusDotClass?: string;
  /** Whether dots should pulse (group is selected and this row belongs to it) */
  pulse?: boolean;
  continuationOnly?: boolean;
}) {
  const gutterWidth = 20 + totalLanes * LANE_WIDTH;
  const hasSelection = selectedLane !== undefined;

  // Root line never dims
  const rootColor = ROOT_LINE_COLOR;
  const laneColor = (laneIdx: number): string =>
    hasSelection && laneIdx !== selectedLane ? LINE_COLOR_DIM : LINE_COLOR;
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
                zIndex: 1,
              }}
            >
              {pulse && (
                <div
                  className={`absolute inset-0 rounded-full ${statusDotClass ?? ''} animate-ping opacity-75`}
                />
              )}
              <div
                className={`w-full h-full rounded-full ${statusDotClass ?? ''}`}
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
                zIndex: 1,
              }}
            >
              {pulse && (
                <div
                  className={`absolute inset-0 rounded-full ${statusDotClass ?? ''} animate-ping opacity-75`}
                />
              )}
              <div
                className={`w-full h-full rounded-full ${statusDotClass ?? ''}`}
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
          aria-label={`Copy ${value}`}
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      ) : null}
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
  activeLane,
  selectedLane,
  correlationNameMap,
  workflowName,
  durationMap,
  onSelectLane,
  onHoverLane,
  onLoadEventData,
}: {
  event: Event;
  node: EventTreeNode;
  totalLanes: number;
  isFirst: boolean;
  isLast: boolean;
  /** The currently active lane (from click or hover). undefined = no focus. */
  activeLane?: number;
  /** The clicked/locked selection (needed for toggle logic). */
  selectedLane?: number;
  /** Map from correlationId → display name */
  correlationNameMap: Map<string, string>;
  /** Workflow name for run-level events */
  workflowName: string | null;
  /** Map from correlationId → execution duration (ms) */
  durationMap: Map<string, number>;
  onSelectLane: (lane: number | undefined) => void;
  onHoverLane: (lane: number | undefined) => void;
  onLoadEventData?: (event: Event) => Promise<unknown | null>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedEventData, setLoadedEventData] = useState<unknown | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const statusDotClass = getStatusDotClass(event.eventType);
  const createdAt = new Date(event.createdAt);
  const hasExistingEventData = 'eventData' in event && event.eventData != null;
  const isRun = isRunLevel(event.eventType);
  const eventName = isRun
    ? (workflowName ?? '-')
    : event.correlationId
      ? (correlationNameMap.get(event.correlationId) ?? '-')
      : '-';

  const durationKey = event.correlationId ?? (isRun ? '__run__' : '');
  const durationMs = durationKey ? durationMap.get(durationKey) : undefined;

  const hasActive = activeLane !== undefined;
  const isRelated = node.lane === activeLane;
  const isDimmed = hasActive && !isRelated;
  const isPulsing = hasActive && isRelated;

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
    // Toggle selection: click same lane deselects, click different lane selects
    if (selectedLane === node.lane) {
      onSelectLane(undefined);
    } else {
      onSelectLane(node.lane);
    }
  }, [selectedLane, node.lane, onSelectLane]);

  const eventData = hasExistingEventData
    ? (event as Event & { eventData: unknown }).eventData
    : loadedEventData;

  const contentOpacity = isDimmed ? 0.3 : 1;

  return (
    <div
      onMouseEnter={() => onHoverLane(node.lane)}
      onMouseLeave={() => onHoverLane(undefined)}
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
          selectedLane={activeLane}
          statusDotClass={statusDotClass}
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
          <div className="text-xs text-muted-foreground tabular-nums flex-1 min-w-0 px-4">
            {formatEventTime(createdAt)}
          </div>

          {/* Event Type */}
          <div className="text-xs font-medium flex-1 min-w-0 px-4">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="relative inline-flex w-1.5 h-1.5 flex-shrink-0">
                {isPulsing && (
                  <span
                    className={`absolute inset-0 rounded-full ${statusDotClass} animate-ping opacity-75`}
                  />
                )}
                <span
                  className={`relative w-1.5 h-1.5 rounded-full ${statusDotClass}`}
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
          <CopyableCell
            value={event.eventId}
            className="font-mono text-xs text-muted-foreground"
          />
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
            selectedLane={activeLane}
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
            {/* Duration */}
            {durationMs !== undefined && (
              <div className="px-2 pb-1.5 text-xs text-muted-foreground">
                Ran for{' '}
                <span className="font-mono tabular-nums">
                  {formatDuration(durationMs)}
                </span>
              </div>
            )}

            {/* Payload */}
            {isLoading && (
              <div className="flex items-center gap-2 p-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Loading...
                </span>
              </div>
            )}

            {loadError && !isLoading && (
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
            )}

            {!isLoading && !loadError && eventData != null && (
              <pre
                className="text-[11px] overflow-x-auto p-2"
                style={{ color: 'var(--ds-gray-1000)' }}
              >
                <code>
                  {JSON.stringify(deserializeByteObjects(eventData), null, 2)}
                </code>
              </pre>
            )}

            {!isLoading &&
              !loadError &&
              eventData == null &&
              durationMs === undefined && (
                <div className="p-2 text-xs text-muted-foreground">No data</div>
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

  // Click a row to lock selection; hover to temporarily highlight.
  const [selectedLane, setSelectedLane] = useState<number | undefined>(
    undefined
  );
  const [hoveredLane, setHoveredLane] = useState<number | undefined>(undefined);
  const onSelectLane = useCallback((lane: number | undefined) => {
    setSelectedLane(lane);
  }, []);
  const onHoverLane = useCallback((lane: number | undefined) => {
    setHoveredLane(lane);
  }, []);

  // Active lane: locked selection takes priority, otherwise hover.
  const activeLane = selectedLane ?? hoveredLane;

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
    <div className="h-full overflow-auto">
      {/* Header */}
      <div
        className="flex items-center gap-0 text-sm font-medium text-muted-foreground sticky top-0 z-10 h-10 border-b bg-background"
        style={{
          borderColor: 'var(--ds-gray-alpha-200)',
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

      {/* Event rows */}
      <div className="flex flex-col">
        {treeNodes.map((node, idx) => (
          <EventRow
            key={node.event.eventId}
            event={node.event}
            node={node}
            totalLanes={totalLanes}
            isFirst={idx === 0}
            isLast={idx === treeNodes.length - 1}
            activeLane={activeLane}
            selectedLane={selectedLane}
            correlationNameMap={correlationNameMap}
            workflowName={workflowName}
            durationMap={durationMap}
            onSelectLane={onSelectLane}
            onHoverLane={onHoverLane}
            onLoadEventData={onLoadEventData}
          />
        ))}
      </div>

      {/* Summary */}
      <div
        className="mt-4 pt-3 border-t text-xs text-muted-foreground px-3"
        style={{ borderColor: 'var(--ds-gray-alpha-200)' }}
      >
        {sortedEvents.length} event{sortedEvents.length !== 1 ? 's' : ''} total
      </div>
    </div>
  );
}
