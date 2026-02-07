'use client';

import type { ReactNode } from 'react';
import styles from '../trace-viewer.module.css';
import type { SpanNode } from '../types';
import { formatDuration } from '../util/timing';
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
// Content props (shared across all type-specific content components)
// ──────────────────────────────────────────────────────────────────────────

export interface SpanContentProps {
  node: SpanNode;
  layout: SpanLayout;
}

// ──────────────────────────────────────────────────────────────────────────
// Default content (used by all types today — identical rendering)
// ──────────────────────────────────────────────────────────────────────────

function DefaultContent({ node, layout }: SpanContentProps): ReactNode {
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
// Per-type content components
// Each returns the same content today but provides a clear extension point.
// ──────────────────────────────────────────────────────────────────────────

export function RunContent(props: SpanContentProps): ReactNode {
  return <DefaultContent {...props} />;
}

export function StepContent(props: SpanContentProps): ReactNode {
  return <DefaultContent {...props} />;
}

export function HookContent(props: SpanContentProps): ReactNode {
  return <DefaultContent {...props} />;
}

export function SleepContent(props: SpanContentProps): ReactNode {
  return <DefaultContent {...props} />;
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
