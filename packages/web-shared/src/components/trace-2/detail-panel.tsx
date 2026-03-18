'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { FlatSpan } from './types';
import { formatDuration, RESOURCE_COLORS } from './utils';

function DetailOverview({ span }: { span: FlatSpan }): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <div className="font-sans text-[11px] font-medium leading-4 text-gray-900 uppercase tracking-[0.5px]">
        Overview
      </div>
      <div className="flex items-start gap-3 text-[13px] leading-5">
        <span className="font-sans text-gray-900 whitespace-nowrap min-w-20 shrink-0">
          Type
        </span>
        <span className="font-mono text-xs text-gray-1000 break-all">
          {span.resourceType}
        </span>
      </div>
      <div className="flex items-start gap-3 text-[13px] leading-5">
        <span className="font-sans text-gray-900 whitespace-nowrap min-w-20 shrink-0">
          Duration
        </span>
        <span className="font-mono text-xs text-gray-1000 break-all">
          {formatDuration(span.duration)}
        </span>
      </div>
      <div className="flex items-start gap-3 text-[13px] leading-5">
        <span className="font-sans text-gray-900 whitespace-nowrap min-w-20 shrink-0">
          Status
        </span>
        <span className="font-mono text-xs text-gray-1000 break-all">
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
    <div className="flex flex-col gap-2">
      <div className="font-sans text-[11px] font-medium leading-4 text-gray-900 uppercase tracking-[0.5px]">
        Events
      </div>
      {span.events.map((event, i) => (
        <div
          key={i}
          className="flex items-center gap-2 py-1.5 border-b border-gray-alpha-200 text-[13px] last:border-b-0"
        >
          <div
            className="size-1.5 rounded-full shrink-0"
            style={{ background: dotColor }}
          />
          <span className="font-sans text-gray-1000 flex-1">{event.name}</span>
          <span className="font-mono text-xs text-gray-900 shrink-0">
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
    <div className="flex flex-col gap-2">
      <div className="font-sans text-[11px] font-medium leading-4 text-gray-900 uppercase tracking-[0.5px]">
        Attributes
      </div>
      <div className="flex flex-col">
        {entries.map(([key, value]) => (
          <div
            key={key}
            className="grid grid-cols-[minmax(100px,auto)_1fr] gap-3 py-1 border-b border-gray-alpha-100 text-[13px] leading-5 last:border-b-0"
          >
            <span className="font-mono text-xs text-gray-900 break-all">
              {key}
            </span>
            <span className="font-mono text-xs text-gray-1000 break-all">
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
    <div className="border-l border-gray-alpha-400 bg-background-100 flex flex-col min-h-0 overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-alpha-400 sticky top-0 bg-background-100 z-[2]">
        <div className="font-sans text-sm font-medium leading-5 text-gray-1000 flex items-center gap-2 min-w-0 overflow-hidden">
          <div
            className="size-5 rounded-sm shrink-0"
            style={{ background: iconBg }}
          />
          <span className="truncate">{span.name}</span>
        </div>
        <button
          className="flex items-center justify-center size-7 border-none bg-transparent cursor-pointer rounded-md text-gray-900 shrink-0 hover:bg-gray-alpha-200 hover:text-gray-1000"
          onClick={onClose}
          type="button"
          aria-label="Close panel"
        >
          <X size={16} />
        </button>
      </div>
      <div className="p-4 flex flex-col gap-5">
        <DetailOverview span={span} />
        <DetailEvents span={span} rootStart={rootStart} />
        <DetailAttributes span={span} />
      </div>
    </div>
  );
}
