'use client';

import type { CSSProperties, ReactNode } from 'react';
import styles from '../trace-viewer.module.css';
import type { SpanNode } from '../types';
import { formatDuration } from '../util/timing';
import {
  type Segment,
  type SegmentStatus,
  SEGMENT_CLASS_MAP,
  computeSegments,
} from './span-segments';
import type { ResourceType, SpanLayout } from './span-strategies';

// ──────────────────────────────────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────────────────────────────────

function getDuration(node: SpanNode): string {
  if (node.isInstrumentationHint) {
    return 'Get Started';
  }
  return formatDuration(node.duration);
}

// ──────────────────────────────────────────────────────────────────────────
// Segment rendering (shared across all workflow span types)
// ──────────────────────────────────────────────────────────────────────────

const SEGMENT_LABELS: Record<SegmentStatus, string> = {
  queued: 'Queued',
  running: '',
  failed: 'Failed',
  retrying: 'Retry wait',
  succeeded: 'Executed',
  waiting: 'Waiting',
  sleeping: 'Sleeping',
  received: 'Received',
};

function SegmentLayer({
  segments,
  spanDuration,
}: {
  segments: Segment[];
  spanDuration: number;
}): ReactNode {
  if (segments.length === 0) return null;

  return (
    <div className={styles.segmentLayer}>
      {segments.map((seg, i) => {
        const className =
          styles[SEGMENT_CLASS_MAP[seg.status] as keyof typeof styles];
        const segDuration =
          (seg.endFraction - seg.startFraction) * spanDuration;
        const label = SEGMENT_LABELS[seg.status];
        const style: CSSProperties = {
          left: `${seg.startFraction * 100}%`,
          width: `${(seg.endFraction - seg.startFraction) * 100}%`,
        };
        // Skip inline label for the first segment (overlaps span name)
        // and for segments with no descriptive label (e.g. "running")
        const showInlineLabel = seg.startFraction > 0.01 && label !== '';

        return (
          <div
            key={`seg-${seg.status}-${String(i)}`}
            className={`${styles.segment} ${String(className)}`}
            style={style}
            title={
              label
                ? `${label} ${formatDuration(segDuration)}`
                : formatDuration(segDuration)
            }
          >
            {showInlineLabel ? (
              <span className={styles.segmentLabel}>
                {label} {formatDuration(segDuration)}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Text content (shared label + duration rendering)
// ──────────────────────────────────────────────────────────────────────────

function TextContent({ node, layout }: SpanContentProps): ReactNode {
  const duration = getDuration(node);

  if (layout.isSmall && !layout.isHovered) {
    return null;
  }

  return (
    <>
      <span className={styles.spanName}>{node.label || node.span.name}</span>
      {layout.isHuge ? <span className={styles.spanSpacer} /> : null}
      {layout.isHovered || layout.width > 128 ? (
        <span className={styles.spanDuration}>{duration}</span>
      ) : null}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Content props
// ──────────────────────────────────────────────────────────────────────────

export interface SpanContentProps {
  node: SpanNode;
  layout: SpanLayout;
}

// ──────────────────────────────────────────────────────────────────────────
// Default content (generic OTEL spans — no segments)
// ──────────────────────────────────────────────────────────────────────────

function DefaultContent({ node, layout }: SpanContentProps): ReactNode {
  return <TextContent node={node} layout={layout} />;
}

// ──────────────────────────────────────────────────────────────────────────
// Workflow content (segments + text for workflow span types)
// ──────────────────────────────────────────────────────────────────────────

function WorkflowContent({
  resourceType,
  node,
  layout,
}: SpanContentProps & { resourceType: ResourceType }): ReactNode {
  const { segments } = computeSegments(resourceType, node);

  return (
    <>
      <SegmentLayer segments={segments} spanDuration={node.duration} />
      <TextContent node={node} layout={layout} />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Per-type content components
// ──────────────────────────────────────────────────────────────────────────

export function RunContent(props: SpanContentProps): ReactNode {
  return <WorkflowContent resourceType="run" {...props} />;
}

export function StepContent(props: SpanContentProps): ReactNode {
  return <WorkflowContent resourceType="step" {...props} />;
}

export function HookContent(props: SpanContentProps): ReactNode {
  return <WorkflowContent resourceType="hook" {...props} />;
}

export function SleepContent(props: SpanContentProps): ReactNode {
  return <WorkflowContent resourceType="sleep" {...props} />;
}

// ──────────────────────────────────────────────────────────────────────────
// Dispatcher
// ──────────────────────────────────────────────────────────────────────────

/**
 * Returns the inner content for a span based on its resource type.
 */
export function SpanContent({
  resourceType,
  ...props
}: SpanContentProps & { resourceType: ResourceType }): ReactNode {
  switch (resourceType) {
    case 'run':
      return <RunContent {...props} />;
    case 'step':
      return <StepContent {...props} />;
    case 'hook':
      return <HookContent {...props} />;
    case 'sleep':
      return <SleepContent {...props} />;
    default:
      return <DefaultContent {...props} />;
  }
}
