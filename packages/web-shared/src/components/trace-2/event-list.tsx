'use client';

import { clsx } from 'clsx';
import { Code, Moon, Workflow, Webhook } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo } from 'react';
import styles from './trace-2.module.css';
import type { FlatSpan, ResourceType } from './types';
import { formatDuration, RESOURCE_COLORS } from './utils';

function ResourceIcon({
  type,
  isErrored,
}: {
  type: ResourceType;
  isErrored: boolean;
}): ReactNode {
  const colors = RESOURCE_COLORS[type];
  const bg = isErrored ? 'var(--ds-red-200)' : colors.bg;
  const iconColor = isErrored ? 'var(--ds-red-900)' : colors.icon;

  const iconProps = { size: 14, strokeWidth: 2, color: iconColor };

  let icon: ReactNode;
  switch (type) {
    case 'run':
      icon = <Workflow {...iconProps} />;
      break;
    case 'step':
      icon = <Code {...iconProps} />;
      break;
    case 'sleep':
      icon = <Moon {...iconProps} />;
      break;
    case 'hook':
      icon = <Webhook {...iconProps} />;
      break;
    default:
      icon = <Code {...iconProps} />;
  }

  return (
    <div className={styles.eventRowIcon} style={{ background: bg }}>
      {icon}
    </div>
  );
}

function Connectors({ span }: { span: FlatSpan }): ReactNode {
  if (span.depth === 0) return null;

  const activeConnectorSet = new Set(
    span.activeConnectors.filter(
      (connectorDepth) => connectorDepth <= span.depth
    )
  );
  const shouldRenderParentConnector = span.hasParentConnector;

  const slots: ReactNode[] = [];

  for (let depth = 1; depth <= span.depth; depth++) {
    const isParentConnectorSlot =
      shouldRenderParentConnector && depth === span.depth;
    if (isParentConnectorSlot) {
      slots.push(
        <div
          key={depth}
          className={clsx(
            styles.connectorSlot,
            span.isLastChild ? styles.elbow : styles.tee
          )}
        />
      );
      continue;
    }

    slots.push(
      <div
        key={depth}
        className={clsx(
          styles.connectorSlot,
          activeConnectorSet.has(depth) && styles.active
        )}
      />
    );
  }

  return <div className={styles.connectorArea}>{slots}</div>;
}

const EventRow = memo(function EventRow({
  span,
  isSelected,
  onClick,
}: {
  span: FlatSpan;
  isSelected: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <div
      className={clsx(
        styles.eventRow,
        isSelected && styles.selected,
        span.isErrored && styles.errored
      )}
      onClick={onClick}
    >
      <Connectors span={span} />
      <div className={styles.eventRowContent}>
        <ResourceIcon type={span.resourceType} isErrored={span.isErrored} />
        <span className={styles.eventRowName}>{span.name}</span>
        <span className={styles.eventRowDuration}>
          {formatDuration(span.duration)}
        </span>
      </div>
    </div>
  );
});

export function EventList({
  spans,
  selectedId,
  onSelect,
}: {
  spans: FlatSpan[];
  selectedId: string | null;
  onSelect: (spanId: string) => void;
}): ReactNode {
  return (
    <>
      <div className={styles.eventListHeader} />
      <div className={styles.eventListBody}>
        {spans.map((span) => (
          <EventRow
            key={span.spanId}
            span={span}
            isSelected={selectedId === span.spanId}
            onClick={() => onSelect(span.spanId)}
          />
        ))}
      </div>
    </>
  );
}
