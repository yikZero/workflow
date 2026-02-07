'use client';

import { clsx } from 'clsx';
import type { CSSProperties, MutableRefObject, ReactNode } from 'react';
import { memo, useRef } from 'react';
import styles from '../trace-viewer.module.css';
import type {
  MemoCache,
  MemoCacheKey,
  RootNode,
  ScrollSnapshot,
  SpanNode,
  VisibleSpan,
  VisibleSpanEvent,
} from '../types';
import { MARKER_HEIGHT, ROW_HEIGHT, ROW_PADDING } from '../util/constants';
import { formatDuration } from '../util/timing';
import { SpanContent } from './span-content';
import {
  type SpanLayout,
  getResourceType,
  getSpanLayout,
} from './span-strategies';

const isSpanSmall = (node: VisibleSpan, scale: number): boolean =>
  node.duration * scale < 64;

const isSpanHuge = (node: VisibleSpan, scale: number): boolean =>
  node.duration * scale >= 500;

export const getSpanColorClassName = (node: SpanNode): string => {
  if (node.isVercel) return String(styles.colorVercel);
  return String(styles[`color${node.resourceIndex % 5}` as 'color0']);
};

export const getSpanClassName = (node: VisibleSpan, scale: number): string => {
  const isHuge = isSpanHuge(node, scale);
  const isHovered = node.isHovered && !isHuge && node.isHighlighted !== false;

  return clsx(
    styles.spanNode,
    isHuge && styles.huge,
    isSpanSmall(node, scale) && styles.small,
    node.isSelected && styles.selected,
    isHovered && styles.xHover,
    node.isHighlighted ? styles.colorHighlight : getSpanColorClassName(node),
    node.isHighlighted === false && styles.unlit
  );
};

export const SpanNodes = memo(function SpanNodes({
  root,
  scale,
  spans,
  scrollSnapshotRef,
  cache,
  customSpanClassNameFunc,
  customSpanEventClassNameFunc,
}: {
  root: RootNode;
  scale: number;
  spans: VisibleSpan[];
  scrollSnapshotRef: MutableRefObject<ScrollSnapshot | undefined>;
  cacheKey?: MemoCacheKey;
  cache: MemoCache;
  customSpanClassNameFunc?: (span: SpanNode) => string;
  customSpanEventClassNameFunc?: (event: VisibleSpanEvent) => string;
}) {
  return spans.map((x) => (
    <SpanComponent
      cacheKey={cache.get(x.span.spanId)}
      customSpanEventClassNameFunc={customSpanEventClassNameFunc}
      customSpanClassNameFunc={customSpanClassNameFunc}
      key={x.span.spanId}
      node={x}
      root={root}
      scale={scale}
      scrollSnapshotRef={scrollSnapshotRef}
    />
  ));
});

// ──────────────────────────────────────────────────────────────────────────
// Compute inline styles from a SpanLayout
// ──────────────────────────────────────────────────────────────────────────

function getSpanStyle(
  layout: SpanLayout,
  node: VisibleSpan,
  root: RootNode,
  scale: number
): CSSProperties {
  return {
    // Use actualWidth for CSS variable so hover expansion is accurate
    '--span-width': `${Math.max(layout.actualWidth, 1)}px`,
    minWidth: layout.isHovered ? layout.width : undefined,
    width: layout.isHovered ? undefined : layout.width,
    height: layout.height,
    maxWidth:
      layout.isHovered && !layout.isNearRightSide
        ? (root.endTime - node.startTime) * scale
        : undefined,
    containIntrinsicWidth: layout.isHovered ? undefined : layout.width,
    containIntrinsicHeight: layout.height,
    left: layout.isNearRightSide ? undefined : layout.left,
    right: layout.isNearRightSide
      ? (root.endTime - node.endTime) * scale
      : undefined,
    top: layout.top,
  } as CSSProperties;
}

// ──────────────────────────────────────────────────────────────────────────
// SpanComponent
// ──────────────────────────────────────────────────────────────────────────

export const SpanComponent = memo(function SpanComponent({
  node,
  root,
  scale,
  scrollSnapshotRef,
  customSpanClassNameFunc,
  customSpanEventClassNameFunc,
}: {
  node: VisibleSpan;
  root: RootNode;
  scale: number;
  scrollSnapshotRef: MutableRefObject<ScrollSnapshot | undefined>;
  cacheKey?: MemoCacheKey;
  customSpanClassNameFunc?: (span: SpanNode) => string;
  customSpanEventClassNameFunc?: (event: VisibleSpanEvent) => string;
}): ReactNode {
  const ref = useRef<HTMLButtonElement>(null);
  node.ref = ref;

  const { span } = node;
  const resourceType = getResourceType(node);
  const layout = getSpanLayout(
    resourceType,
    node,
    root,
    scale,
    scrollSnapshotRef
  );

  const duration = node.isInstrumentationHint
    ? 'Get Started'
    : formatDuration(node.duration);

  // Get custom class name from callback if provided
  const customClassName = customSpanClassNameFunc
    ? customSpanClassNameFunc(node)
    : '';

  return (
    <>
      <button
        aria-label={`${span.name} - ${duration}`}
        className={clsx(getSpanClassName(node, scale), customClassName)}
        data-span-id={span.spanId}
        data-start-time={node.startTime - root.startTime}
        data-right-side={layout.isNearRightSide}
        ref={ref}
        style={getSpanStyle(layout, node, root, scale)}
        type="button"
      >
        <SpanContent resourceType={resourceType} node={node} layout={layout} />
      </button>
      {node.events && !layout.isSmall
        ? node.events.map((x) => (
            <SpanEventComponent
              customSpanEventClassNameFunc={customSpanEventClassNameFunc}
              event={x}
              key={x.key}
              node={node}
              root={root}
              scale={scale}
            />
          ))
        : null}
    </>
  );
});

// ──────────────────────────────────────────────────────────────────────────
// SpanEventComponent
// ──────────────────────────────────────────────────────────────────────────

export const SpanEventComponent = memo(function SpanEventComponent({
  event,
  node,
  root,
  scale,
  customSpanEventClassNameFunc,
}: {
  event: VisibleSpanEvent;
  node: VisibleSpan;
  root: RootNode;
  scale: number;
  customSpanEventClassNameFunc?: (event: VisibleSpanEvent) => string;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  event.ref = ref;

  const {
    event: { name },
  } = event;
  const timestamp = formatDuration(event.timestamp - root.startTime);

  const left = (event.timestamp - root.startTime) * scale;
  const top = MARKER_HEIGHT + (ROW_HEIGHT + ROW_PADDING) * node.row;

  // Get custom class name from callback if provided
  const customClassName = customSpanEventClassNameFunc
    ? customSpanEventClassNameFunc(event)
    : '';

  return (
    <div
      title={`${name} at ${timestamp}`}
      className={clsx(
        styles.spanNodeEvent,
        customClassName,
        node.isHighlighted
          ? styles.colorHighlight
          : getSpanColorClassName(node),
        node.isHighlighted === false && styles.unlit
      )}
      data-hovered={event.isHovered}
      ref={ref}
      style={
        {
          left,
          top,
        } as CSSProperties
      }
    >
      <div
        className={clsx(
          styles.hoverInfo,
          (event.timestamp - node.startTime) / node.duration < 0.5
            ? styles.alignStart
            : styles.alignEnd
        )}
      >
        <span className={styles.eventName}>{name}</span>
        <span className={styles.eventTimestamp}>{timestamp}</span>
      </div>
      <div className={styles.eventDiamond} />
    </div>
  );
});
