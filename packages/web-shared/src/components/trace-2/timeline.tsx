'use client';

import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';
import styles from './trace-2.module.css';
import type { FlatSpan } from './types';
import { computeTimeMarkers, RESOURCE_COLORS } from './utils';
import { cva } from 'class-variance-authority';

const barSpan = cva(['rounded-xs', 'bg-gray-200', 'h-4', 'w-full', 'mt-1'], {
  variants: {
    color: {
      blue: 'bg-blue-200',
      green: 'bg-green-200',
      amber: 'bg-amber-200',
      purple: 'bg-purple-200',
      gray: 'bg-gray-200',
    },
  },
});

const TimelineBar = memo(function TimelineBar({
  span,
  viewStart,
  viewDuration,
}: {
  span: FlatSpan;
  viewStart: number;
  viewDuration: number;
}): ReactNode {
  if (viewDuration <= 0) return null;

  const relStart = span.startTime - viewStart;
  const leftPct = (relStart / viewDuration) * 100;
  const widthPct = (span.duration / viewDuration) * 100;

  const colors = RESOURCE_COLORS[span.resourceType];
  const barColor = span.isErrored
    ? colors.errorBar || 'var(--ds-red-700)'
    : colors.bar;

  const hasQueued =
    span.activeStartTime != null && span.activeStartTime > span.startTime;
  const queuedDuration = hasQueued ? span.activeStartTime! - span.startTime : 0;
  const activeDuration = hasQueued
    ? span.duration - queuedDuration
    : span.duration;
  const queuedPct =
    viewDuration > 0 ? (queuedDuration / viewDuration) * 100 : 0;
  const activePct =
    viewDuration > 0 ? (activeDuration / viewDuration) * 100 : 0;

  return (
    <div className={styles.timelineRow}>
      <div
        className={styles.timelineBarContainer}
        style={{
          left: `${leftPct}%`,
          width: `max(${widthPct}%, 4px)`,
        }}
      >
        {hasQueued ? (
          <div className="flex gap-0.5 w-full">
            <div
              className={barSpan({ color: 'gray' })}
              style={{ width: `${(queuedPct / widthPct) * 100}%`, minWidth: 4 }}
            />
            <div
              className={styles.barActive}
              style={{
                width: `${(activePct / widthPct) * 100}%`,
                minWidth: 4,
                background: barColor,
              }}
            />
          </div>
        ) : (
          <div
            className={styles.barActive}
            style={{
              width: '100%',
              minWidth: 4,
              background: barColor,
            }}
          />
        )}
      </div>
    </div>
  );
});

export function Timeline({
  spans,
  viewStart,
  viewDuration,
  rootStart,
  isZoomed,
  onResetZoom,
}: {
  spans: FlatSpan[];
  viewStart: number;
  viewDuration: number;
  rootStart: number;
  isZoomed: boolean;
  onResetZoom: () => void;
}): ReactNode {
  const markers = useMemo(
    () => computeTimeMarkers(viewDuration, viewStart - rootStart),
    [viewDuration, viewStart, rootStart]
  );

  return (
    <>
      <div className={styles.timelineHeader}>
        {markers.map((m) => (
          <span
            key={m.label}
            className={styles.timeMarker}
            style={{ left: `${m.position * 100}%` }}
          >
            {m.label}
          </span>
        ))}
        {isZoomed && (
          <button
            type="button"
            className={styles.resetZoomButton}
            onClick={onResetZoom}
          >
            Reset zoom
          </button>
        )}
      </div>
      <div className={styles.timelineBody}>
        <div className={styles.gridLines}>
          {markers.map((m) => (
            <div
              key={m.label}
              className={styles.gridLine}
              style={{ left: `${m.position * 100}%` }}
            />
          ))}
        </div>
        {spans.map((span) => (
          <TimelineBar
            key={span.spanId}
            span={span}
            viewStart={viewStart}
            viewDuration={viewDuration}
          />
        ))}
      </div>
    </>
  );
}
