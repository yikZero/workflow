'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './trace-2.module.css';
import type { FlatSpan } from './types';
import { formatDuration, RESOURCE_COLORS } from './utils';

function DetailOverview({ span }: { span: FlatSpan }): ReactNode {
  return (
    <div className={styles.detailSection}>
      <div className={styles.detailSectionTitle}>Overview</div>
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>Type</span>
        <span className={styles.detailValue}>{span.resourceType}</span>
      </div>
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>Duration</span>
        <span className={styles.detailValue}>
          {formatDuration(span.duration)}
        </span>
      </div>
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>Status</span>
        <span className={styles.detailValue}>
          {span.isErrored ? 'Errored' : 'OK'}
        </span>
      </div>
    </div>
  );
}

function DetailEvents({
  span,
  rootStart,
}: {
  span: FlatSpan;
  rootStart: number;
}): ReactNode {
  if (span.events.length === 0) return null;

  const colors = RESOURCE_COLORS[span.resourceType];
  const dotColor = span.isErrored ? 'var(--ds-red-700)' : colors.bar;

  return (
    <div className={styles.detailSection}>
      <div className={styles.detailSectionTitle}>Events</div>
      {span.events.map((event, i) => (
        <div key={i} className={styles.eventItem}>
          <div className={styles.eventDot} style={{ background: dotColor }} />
          <span className={styles.eventItemName}>{event.name}</span>
          <span className={styles.eventItemTime}>
            {formatDuration(event.timestamp - rootStart)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DetailAttributes({ span }: { span: FlatSpan }): ReactNode {
  const entries = Object.entries(span.attributes).filter(
    ([key]) => key !== 'resource' && key !== 'data'
  );
  if (entries.length === 0) return null;

  return (
    <div className={styles.detailSection}>
      <div className={styles.detailSectionTitle}>Attributes</div>
      <div className={styles.attrTable}>
        {entries.map(([key, value]) => (
          <div key={key} className={styles.attrRow}>
            <span className={styles.attrKey}>{key}</span>
            <span className={styles.attrValue}>
              {typeof value === 'string' ? value : JSON.stringify(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailPanel({
  span,
  rootStart,
  onClose,
}: {
  span: FlatSpan;
  rootStart: number;
  onClose: () => void;
}): ReactNode {
  const colors = RESOURCE_COLORS[span.resourceType];
  const iconBg = span.isErrored ? 'var(--ds-red-200)' : colors.bg;

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailPanelHeader}>
        <div className={styles.detailPanelTitle}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              background: iconBg,
              flexShrink: 0,
            }}
          />
          <span className={styles.detailPanelTitleName}>{span.name}</span>
        </div>
        <button
          className={styles.detailPanelClose}
          onClick={onClose}
          type="button"
          aria-label="Close panel"
        >
          <X size={16} />
        </button>
      </div>
      <div className={styles.detailPanelBody}>
        <DetailOverview span={span} />
        <DetailEvents span={span} rootStart={rootStart} />
        <DetailAttributes span={span} />
      </div>
    </div>
  );
}
