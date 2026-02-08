'use client';

import type { Event } from '@workflow/world';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

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

function formatEventDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    fractionalSecondDigits: 3,
  });
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

function getStatusColor(eventType: Event['eventType']): string {
  if (eventType === 'step_failed' || eventType === 'run_failed') {
    return 'var(--ds-red-700)';
  }
  if (eventType === 'step_retrying') {
    return 'var(--ds-amber-700)';
  }
  if (
    eventType === 'step_completed' ||
    eventType === 'run_completed' ||
    eventType === 'hook_disposed' ||
    eventType === 'wait_completed'
  ) {
    return 'var(--ds-green-700)';
  }
  if (eventType === 'hook_created' || eventType === 'hook_received') {
    return 'var(--ds-purple-700)';
  }
  return 'var(--ds-gray-700)';
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
  /** When true, only draw lane continuation lines (for expanded detail areas) */
  continuationOnly = false,
}: {
  node: EventTreeNode;
  totalLanes: number;
  isFirst: boolean;
  isLast: boolean;
  selectedLane?: number;
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
                borderRadius: '50%',
                backgroundColor: rootColor,
                transition: 'background-color 150ms',
              }}
            />
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
          {node.lane >= 0 && !node.isBranchStart && (
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
                borderRadius: '50%',
                backgroundColor: thisLaneColor,
                transition: 'background-color 150ms',
              }}
            />
          )}
        </>
      )}

      {/* Lane vertical lines for active correlations */}
      {Array.from(node.activeLanes).map((laneIdx) => {
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
// Event row
// ──────────────────────────────────────────────────────────────────────────

interface EventsListProps {
  events: Event[] | null;
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
  onSelectLane: (lane: number | undefined) => void;
  onHoverLane: (lane: number | undefined) => void;
  onLoadEventData?: (event: Event) => Promise<unknown | null>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedEventData, setLoadedEventData] = useState<unknown | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const statusColor = getStatusColor(event.eventType);
  const createdAt = new Date(event.createdAt);
  const hasExistingEventData = 'eventData' in event && event.eventData != null;

  const hasActive = activeLane !== undefined;
  const isRelated = node.lane === activeLane;
  const isDimmed = hasActive && !isRelated;

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
    <div>
      {/* Row */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onMouseEnter={() => onHoverLane(node.lane)}
        onMouseLeave={() => onHoverLane(undefined)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleRowClick();
        }}
        className="w-full text-left flex items-center gap-0 text-xs hover:bg-[var(--ds-gray-alpha-100)] transition-colors cursor-pointer"
        style={{ minHeight: 32 }}
      >
        {/* Tree gutter — never dimmed by row opacity */}
        <TreeGutter
          node={node}
          totalLanes={totalLanes}
          isFirst={isFirst}
          isLast={isLast && !isExpanded}
          selectedLane={activeLane}
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
          <div
            className="font-mono tabular-nums flex-1 min-w-0 px-2"
            style={{ color: 'var(--ds-gray-800)' }}
          >
            {formatEventTime(createdAt)}
          </div>

          {/* Event Type */}
          <div
            className="font-medium flex-1 min-w-0 px-2"
            style={{ color: 'var(--ds-gray-1000)' }}
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: statusColor }}
              />
              {formatEventType(event.eventType)}
            </span>
          </div>

          {/* Correlation ID */}
          <div
            className="font-mono text-[11px] flex-1 min-w-0 px-2 overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ color: 'var(--ds-gray-700)' }}
            title={event.correlationId || '-'}
          >
            {event.correlationId || '-'}
          </div>

          {/* Event ID */}
          <div
            className="font-mono text-[11px] flex-1 min-w-0 px-2 overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ color: 'var(--ds-gray-600)' }}
            title={event.eventId}
          >
            {event.eventId}
          </div>
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
            className="flex-1 py-2 pr-3 ml-2"
            style={{
              borderTop: '1px solid var(--ds-gray-alpha-200)',
              opacity: contentOpacity,
              transition: 'opacity 150ms',
            }}
          >
            {/* Attributes */}
            <div
              className="flex flex-col divide-y rounded-md border overflow-hidden"
              style={{ borderColor: 'var(--ds-gray-alpha-200)' }}
            >
              <AttributeRow label="Event ID" value={event.eventId} mono />
              <AttributeRow label="Event Type" value={event.eventType} />
              <AttributeRow
                label="Correlation ID"
                value={event.correlationId || '-'}
                mono
              />
              <AttributeRow label="Run ID" value={event.runId} mono />
              <AttributeRow
                label="Created At"
                value={formatEventDateTime(createdAt)}
              />
            </div>

            {/* Event data */}
            <div className="mt-3">
              <div
                className="text-xs font-medium mb-1.5"
                style={{ color: 'var(--ds-gray-700)' }}
              >
                Event Data
              </div>

              {isLoading && (
                <div
                  className="flex items-center gap-2 rounded-md border p-3"
                  style={{ borderColor: 'var(--ds-gray-alpha-200)' }}
                >
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    style={{ color: 'var(--ds-gray-700)' }}
                  />
                  <span
                    className="text-xs"
                    style={{ color: 'var(--ds-gray-700)' }}
                  >
                    Loading event details...
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
                  className="text-[11px] overflow-x-auto rounded-md border p-3"
                  style={{
                    borderColor: 'var(--ds-gray-alpha-200)',
                    color: 'var(--ds-gray-1000)',
                  }}
                >
                  <code>{JSON.stringify(eventData, null, 2)}</code>
                </pre>
              )}

              {!isLoading &&
                !loadError &&
                eventData == null &&
                !event.correlationId && (
                  <div
                    className="rounded-md border p-3 text-xs"
                    style={{
                      borderColor: 'var(--ds-gray-alpha-200)',
                      color: 'var(--ds-gray-700)',
                    }}
                  >
                    No event data available
                  </div>
                )}

              {!isLoading &&
                !loadError &&
                eventData == null &&
                event.correlationId &&
                !hasExistingEventData &&
                loadedEventData === null && (
                  <div
                    className="rounded-md border p-3 text-xs"
                    style={{
                      borderColor: 'var(--ds-gray-alpha-200)',
                      color: 'var(--ds-gray-700)',
                    }}
                  >
                    No event data for this event type
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AttributeRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between px-2.5 py-1.5"
      style={{ borderColor: 'var(--ds-gray-alpha-200)' }}
    >
      <span
        className="text-[11px] font-medium"
        style={{ color: 'var(--ds-gray-700)' }}
      >
        {label}
      </span>
      <span
        className={`text-[11px] ${mono ? 'font-mono' : ''} text-right max-w-[70%] break-all`}
        style={{ color: 'var(--ds-gray-1000)' }}
      >
        {value}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────────────────

export function EventListView({ events, onLoadEventData }: EventsListProps) {
  const sortedEvents = useMemo(() => {
    if (!events || events.length === 0) return [];
    return [...events].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [events]);

  const treeNodes = useMemo(() => buildEventTree(sortedEvents), [sortedEvents]);

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
        className="flex items-center gap-0 text-xs font-medium sticky top-0 z-10 py-2 border-b"
        style={{
          borderColor: 'var(--ds-gray-alpha-200)',
          backgroundColor: 'var(--ds-background-100)',
          color: 'var(--ds-gray-700)',
        }}
      >
        <div
          className="flex-shrink-0"
          style={{ width: 20 + totalLanes * LANE_WIDTH }}
        />
        <div className="w-5 flex-shrink-0" />
        <div className="flex-1 min-w-0 px-2">Time</div>
        <div className="flex-1 min-w-0 px-2">Event Type</div>
        <div className="flex-1 min-w-0 px-2">Correlation ID</div>
        <div className="flex-1 min-w-0 px-2">Event ID</div>
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
            onSelectLane={onSelectLane}
            onHoverLane={onHoverLane}
            onLoadEventData={onLoadEventData}
          />
        ))}
      </div>

      {/* Summary */}
      <div
        className="mt-4 pt-3 border-t text-xs px-3"
        style={{
          borderColor: 'var(--ds-gray-alpha-200)',
          color: 'var(--ds-gray-700)',
        }}
      >
        {sortedEvents.length} event{sortedEvents.length !== 1 ? 's' : ''} total
      </div>
    </div>
  );
}
