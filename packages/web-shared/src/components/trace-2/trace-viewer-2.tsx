'use client';

import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';
import { DetailPanel } from './detail-panel';
import { EventList } from './event-list';
import { Timeline } from './timeline';
import type { Trace } from './types';
import { buildTimeCompression, flattenTrace } from './utils';

export interface TraceViewer2Props {
  trace?: Trace;
  className?: string;
}

const MAX_ZOOM = 20;
const TIMELINE_PADDING = 16;

interface Viewport {
  start: number;
  end: number;
}

export function TraceViewer2({
  trace,
  className,
}: TraceViewer2Props): ReactNode {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ start: 0, end: 0 });

  const { spans, root } = useMemo(() => {
    if (!trace)
      return {
        spans: [],
        root: {
          startTime: 0,
          endTime: 0,
          duration: 0,
          depth: 0 as const,
          children: [],
        },
      };
    return flattenTrace(trace);
  }, [trace]);

  useEffect(() => {
    setViewport({ start: root.startTime, end: root.startTime + root.duration });
  }, [root.startTime, root.duration]);

  const viewDuration = viewport.end - viewport.start;

  const timeCompression = useMemo(
    () => buildTimeCompression(spans, viewport.start, viewport.end),
    [spans, viewport.start, viewport.end]
  );

  const isZoomed =
    viewport.start > root.startTime + 0.01 ||
    viewport.end < root.startTime + root.duration - 0.01;

  const resetZoom = useCallback(() => {
    setViewport({ start: root.startTime, end: root.startTime + root.duration });
  }, [root.startTime, root.duration]);

  const selectedSpan = useMemo(
    () =>
      selectedId ? (spans.find((s) => s.spanId === selectedId) ?? null) : null,
    [selectedId, spans]
  );

  const onSelect = useCallback((spanId: string) => {
    setSelectedId((prev) => (prev === spanId ? null : spanId));
  }, []);

  const onClosePanel = useCallback(() => {
    setSelectedId(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return;

    const rootS = root.startTime;
    const rootE = root.startTime + root.duration;
    const rootD = root.duration;
    if (rootD <= 0) return;

    const onWheel = (e: WheelEvent): void => {
      const isZoomGesture = e.ctrlKey || e.metaKey;
      const hasDeltaX = Math.abs(e.deltaX) > Math.abs(e.deltaY);

      if (!isZoomGesture && !hasDeltaX) return;
      e.preventDefault();

      const rect = el.getBoundingClientRect();
      const contentWidth = rect.width - TIMELINE_PADDING * 2;
      if (contentWidth <= 0) return;

      if (isZoomGesture) {
        let dy = e.deltaY;
        if (e.deltaMode === 1) dy *= 16;

        const cursorFraction = Math.max(
          0,
          Math.min(1, (e.clientX - rect.left - TIMELINE_PADDING) / contentWidth)
        );
        const scaleFactor = Math.pow(2, dy / 200);

        setViewport((prev) => {
          const prevDuration = prev.end - prev.start;
          const cursorTime = prev.start + cursorFraction * prevDuration;
          const minViewport = Math.max(10, rootD / MAX_ZOOM);
          const newDuration = Math.max(
            minViewport,
            Math.min(rootD, prevDuration * scaleFactor)
          );

          let newStart = cursorTime - cursorFraction * newDuration;
          let newEnd = newStart + newDuration;

          if (newStart < rootS) {
            newStart = rootS;
            newEnd = rootS + newDuration;
          }
          if (newEnd > rootE) {
            newEnd = rootE;
            newStart = Math.max(rootS, rootE - newDuration);
          }

          return { start: newStart, end: newEnd };
        });
      } else {
        let dx = e.deltaX;
        if (e.deltaMode === 1) dx *= 16;

        setViewport((prev) => {
          const prevDuration = prev.end - prev.start;
          const panAmount = (dx / contentWidth) * prevDuration;

          let newStart = prev.start + panAmount;
          let newEnd = prev.end + panAmount;

          if (newStart < rootS) {
            newStart = rootS;
            newEnd = rootS + prevDuration;
          }
          if (newEnd > rootE) {
            newEnd = rootE;
            newStart = Math.max(rootS, rootE - prevDuration);
          }

          return { start: newStart, end: newEnd };
        });
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [root.startTime, root.duration]);

  if (!trace || spans.length === 0) {
    return (
      <div
        className={cn(
          'grid grid-cols-[1fr] grid-rows-[1fr] h-full min-h-0 overflow-hidden bg-background-100 border border-gray-400 rounded-lg relative',
          className
        )}
      >
        <div className="grid grid-cols-[1fr_1px_1fr] h-full min-h-0 overflow-y-auto overflow-x-hidden content-start">
          <div className="block min-h-0 overflow-visible" />
          <div className="bg-gray-alpha-400 h-full" />
          <div className="block min-h-0 overflow-visible relative" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid grid-rows-[1fr] h-full min-h-0 overflow-hidden bg-background-100 border border-gray-400 rounded-lg relative',
        selectedSpan ? 'grid-cols-[1fr_400px]' : 'grid-cols-[1fr]',
        className
      )}
    >
      <div className="grid grid-cols-[1fr_1px_1fr] h-full min-h-0 overflow-y-auto overflow-x-hidden content-start">
        <div className="block min-h-0 overflow-visible">
          <EventList
            spans={spans}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
        <div className="bg-gray-alpha-400 h-full" />
        <div
          ref={timelineRef}
          className="block min-h-0 overflow-visible relative"
          onDoubleClick={resetZoom}
        >
          <Timeline
            spans={spans}
            viewStart={viewport.start}
            viewDuration={viewDuration}
            rootStart={root.startTime}
            compression={timeCompression}
            isZoomed={isZoomed}
            onResetZoom={resetZoom}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
      </div>
      {selectedSpan ? (
        <DetailPanel
          span={selectedSpan}
          rootStart={root.startTime}
          onClose={onClosePanel}
        />
      ) : null}
    </div>
  );
}
