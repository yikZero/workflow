'use client';

import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { memo, useMemo } from 'react';
import styles from './trace-2.module.css';
import type { FlatSpan } from './types';
import type { TimeCompression } from './utils';
import {
  computeCompressedTimeMarkers,
  computeTimeMarkers,
  RESOURCE_COLORS,
} from './utils';

const TimelineBar = memo(function TimelineBar({
  span,
  compression,
  isSelected,
  onClick,
}: {
  span: FlatSpan;
  compression: TimeCompression;
  isSelected: boolean;
  onClick: () => void;
}): ReactNode {
  const leftFrac = compression.toVisual(span.startTime);
  const rightFrac = compression.toVisual(span.endTime);
  const widthFrac = rightFrac - leftFrac;

  const leftPct = leftFrac * 100;
  const widthPct = widthFrac * 100;

  const colors = RESOURCE_COLORS[span.resourceType];
  const barColor = span.isErrored
    ? colors.errorBar || 'var(--ds-red-700)'
    : colors.bar;

  const hasQueued =
    span.activeStartTime != null && span.activeStartTime > span.startTime;

  let queuedBarPct = 0;
  let activeBarPct = 100;
  if (hasQueued && widthFrac > 0) {
    const activeFrac = compression.toVisual(span.activeStartTime!);
    queuedBarPct = ((activeFrac - leftFrac) / widthFrac) * 100;
    activeBarPct = 100 - queuedBarPct;
  }

  return (
    <div
      className={clsx(styles.timelineRow, isSelected && styles.selected)}
      onClick={onClick}
    >
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
              className={styles.barQueued}
              style={{ width: `${queuedBarPct}%`, minWidth: 4 }}
            />
            <div
              className={styles.barActive}
              style={{
                width: `${activeBarPct}%`,
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
  compression,
  isZoomed,
  onResetZoom,
  selectedId,
  onSelect,
}: {
  spans: FlatSpan[];
  viewStart: number;
  viewDuration: number;
  rootStart: number;
  compression: TimeCompression;
  isZoomed: boolean;
  onResetZoom: () => void;
  selectedId: string | null;
  onSelect: (spanId: string) => void;
}): ReactNode {
  const viewEnd = viewStart + viewDuration;

  const markers = useMemo(
    () =>
      compression.isCompressed
        ? computeCompressedTimeMarkers(
            compression,
            viewStart,
            viewEnd,
            rootStart
          )
        : computeTimeMarkers(viewDuration, viewStart - rootStart),
    [compression, viewStart, viewEnd, viewDuration, rootStart]
  );

  return (
    <>
      <div className={styles.timelineHeader}>
        {markers.map((m, i) => (
          <span
            key={i}
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
        {spans.map((span) => {
          return (
            <TimelineBar
              key={span.spanId}
              span={span}
              compression={compression}
              isSelected={selectedId === span.spanId}
              onClick={() => onSelect(span.spanId)}
            />
          );
        })}
      </div>
    </>
  );
}
