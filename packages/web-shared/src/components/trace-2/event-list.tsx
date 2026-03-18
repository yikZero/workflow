'use client';

import { Code, Moon, Workflow, Webhook } from 'lucide-react';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { cn } from '../../lib/utils';
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
    <div
      className="flex items-center justify-center size-[22px] min-w-[22px] rounded-sm shrink-0"
      style={{ background: bg }}
    >
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
        <div key={depth} className="w-5 min-w-5 relative h-9">
          <div
            className={cn(
              'absolute top-0 left-[10px] w-px bg-gray-400',
              span.isLastChild ? 'h-1/2' : 'h-full'
            )}
          />
          <div className="absolute top-1/2 left-[10px] w-[10px] h-px bg-gray-400" />
        </div>
      );
      continue;
    }

    slots.push(
      <div key={depth} className="w-5 min-w-5 relative h-9">
        {activeConnectorSet.has(depth) && (
          <div className="absolute top-0 left-[10px] w-px h-full bg-gray-400" />
        )}
      </div>
    );
  }

  return <div className="flex items-stretch h-full shrink-0">{slots}</div>;
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
      className={cn(
        'flex items-center h-9 cursor-pointer select-none pr-3 relative transition-[background-color] duration-[120ms] ease-in-out',
        isSelected ? 'bg-gray-alpha-200' : 'hover:bg-gray-alpha-100'
      )}
      onClick={onClick}
    >
      <Connectors span={span} />
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <ResourceIcon type={span.resourceType} isErrored={span.isErrored} />
        <span
          className={cn(
            'font-sans text-sm font-normal leading-5 truncate flex-1 min-w-0',
            span.isErrored ? 'text-red-900' : 'text-gray-1000'
          )}
        >
          {span.name}
        </span>
        <span
          className={cn(
            'font-mono text-xs font-normal leading-4 whitespace-nowrap shrink-0',
            span.isErrored ? 'text-red-800' : 'text-gray-900'
          )}
        >
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
      <div className="sticky top-0 z-[4] bg-background-100 border-b border-gray-alpha-400 h-8 min-h-8 flex items-center px-4" />
      <div className="block">
        {spans.map((span) => {
          return (
            <EventRow
              key={span.spanId}
              span={span}
              isSelected={selectedId === span.spanId}
              onClick={() => onSelect(span.spanId)}
            />
          );
        })}
      </div>
    </>
  );
}
