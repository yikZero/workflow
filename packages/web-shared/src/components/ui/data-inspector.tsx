'use client';

/**
 * Reusable data inspector built on react-json-view-lite.
 *
 * All data rendering in the o11y UI should use this component to ensure
 * consistent styling. Values that are not plain JSON (StreamRef,
 * ClassInstanceRef, Encrypted markers, Uint8Array, Map, Set, Date) are
 * pre-processed into readable plain-JSON shapes before being handed to the
 * renderer.
 */

import { createContext, useCallback, useMemo, useRef } from 'react';
import { JsonView } from 'react-json-view-lite';
import { ENCRYPTED_DISPLAY_NAME } from '../../lib/hydration';
import { formatArrayBufferViewForDisplay } from '../../lib/stream-display';

const STREAM_REF_TYPE = '__workflow_stream_ref__';
const CLASS_INSTANCE_REF_TYPE = '__workflow_class_instance_ref__';
const RUN_REF_TYPE = '__workflow_run_ref__';

interface StreamRef {
  __type: typeof STREAM_REF_TYPE;
  streamId: string;
}

interface RunRef {
  __type: typeof RUN_REF_TYPE;
  runId: string;
}

interface ClassInstanceRef {
  __type: typeof CLASS_INSTANCE_REF_TYPE;
  className: string;
  classId: string;
  data: unknown;
}

function isStreamRef(value: unknown): value is StreamRef {
  if (value === null || typeof value !== 'object') return false;
  const desc = Object.getOwnPropertyDescriptor(value, '__type');
  return desc?.value === STREAM_REF_TYPE;
}

function isRunRef(value: unknown): value is RunRef {
  if (value === null || typeof value !== 'object') return false;
  const desc = Object.getOwnPropertyDescriptor(value, '__type');
  return desc?.value === RUN_REF_TYPE;
}

function isClassInstanceRef(value: unknown): value is ClassInstanceRef {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__type' in value &&
    (value as Record<string, unknown>).__type === CLASS_INSTANCE_REF_TYPE
  );
}

function isEncryptedMarker(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    value.constructor?.name === ENCRYPTED_DISPLAY_NAME
  );
}

/**
 * Decrypt context kept for callers (e.g. AttributePanel's top-level encrypted
 * field block) that render their own decrypt UI. DataInspector itself no
 * longer renders inline decrypt buttons.
 */
export type DecryptClickContextValue = {
  onDecrypt: () => void;
  isDecrypting: boolean;
};

export const DecryptClickContext = createContext<
  DecryptClickContextValue | undefined
>(undefined);

/**
 * Walk data and normalize non-JSON values into plain-JSON shapes the
 * renderer can display:
 *   - StreamRef       → "📡 {streamId}"
 *   - RunRef          → "↗ {runId}"
 *   - Encrypted       → "🔒 Encrypted"
 *   - ClassInstanceRef → { [className]: data }
 *   - Date            → ISO string
 *   - Uint8Array etc  → decoded UTF-8 text or compact byte summary
 *   - Map             → object keyed by stringified keys
 *   - Set             → array
 *
 * Exported for tests.
 */
export function collapseRefs(data: unknown, seen = new WeakSet()): unknown {
  if (data === null || typeof data !== 'object') return data;

  if (seen.has(data)) return '[Circular]';
  seen.add(data);

  if (data instanceof Date) {
    return data.toISOString();
  }

  if (ArrayBuffer.isView(data) && !(data instanceof DataView)) {
    return formatArrayBufferViewForDisplay(data).text;
  }

  if (isStreamRef(data)) {
    return `📡 ${data.streamId}`;
  }

  if (isRunRef(data)) {
    return `↗ ${data.runId}`;
  }

  if (isEncryptedMarker(data)) {
    return '🔒 Encrypted';
  }

  if (isClassInstanceRef(data)) {
    return { [data.className]: collapseRefs(data.data, seen) };
  }

  if (Array.isArray(data)) {
    return data.map((v) => collapseRefs(v, seen));
  }

  if (data instanceof Map) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of data.entries()) {
      const stringKey =
        typeof key === 'string' ? key : JSON.stringify(collapseRefs(key, seen));
      result[stringKey] = collapseRefs(value, seen);
    }
    return result;
  }

  if (data instanceof Set) {
    return Array.from(data.values(), (v) => collapseRefs(v, seen));
  }

  // Plain objects — recurse. Class instances (Error, URL, Headers, etc.)
  // are passed through untouched so the renderer's default rendering applies.
  const proto = Object.getPrototypeOf(data);
  if (proto !== Object.prototype && proto !== null) {
    return data;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = collapseRefs(value, seen);
  }
  return result;
}

const jsonStyles = {
  container: 'wf-json-container',
  basicChildStyle: 'wf-json-child',
  childFieldsContainer: 'wf-json-child-fields',
  label: 'wf-json-label',
  clickableLabel: 'wf-json-clickable-label',
  nullValue: 'wf-json-null',
  undefinedValue: 'wf-json-null',
  numberValue: 'wf-json-number',
  stringValue: 'wf-json-string',
  booleanValue: 'wf-json-boolean',
  otherValue: 'wf-json-other',
  punctuation: 'wf-json-punctuation',
  collapseIcon: 'wf-json-collapse-icon',
  expandIcon: 'wf-json-expand-icon',
  collapsedContent: 'wf-json-collapsed-content',
  noQuotesForStringValues: false,
  quotesForFieldNames: false,
};

export interface DataInspectorProps {
  /** The data to inspect */
  data: unknown;
  /** Initial expand depth (default: 2) */
  expandLevel?: number;
  /** Optional name for the root node */
  name?: string;
  /** No-op — retained for API compatibility (clickable Stream badge removed) */
  onStreamClick?: (streamId: string) => void;
  /** No-op — retained for API compatibility (clickable Run badge removed) */
  onRunClick?: (runId: string) => void;
  /** No-op — retained for API compatibility (inline Decrypt button removed) */
  onDecrypt?: () => void;
  /** No-op — retained for API compatibility */
  isDecrypting?: boolean;
}

export function DataInspector({
  data,
  expandLevel = 2,
  name,
}: DataInspectorProps) {
  const collapsedData = useMemo(() => collapseRefs(data), [data]);
  const stableData = useStableInspectorData(collapsedData);

  // Stable reference: react-json-view-lite calls this only when its
  // identity changes, so a stable function preserves user-toggled state
  // across parent re-renders. Root (level 0) is always expanded.
  const shouldExpandNode = useCallback(
    (level: number) => level === 0 || level < expandLevel,
    [expandLevel]
  );

  const renderData = useMemo<object | unknown[]>(() => {
    if (
      typeof stableData === 'object' &&
      stableData !== null &&
      !Array.isArray(stableData)
    ) {
      return name != null ? { [name]: stableData } : (stableData as object);
    }
    if (Array.isArray(stableData)) {
      return name != null ? { [name]: stableData } : stableData;
    }
    return name != null ? { [name]: stableData } : { value: stableData };
  }, [stableData, name]);

  return (
    <span className="wf-json-wrapper">
      <JsonView
        clickToExpandNode
        data={renderData}
        shouldExpandNode={shouldExpandNode}
        style={jsonStyles}
      />
    </span>
  );
}

function useStableInspectorData<T>(next: T): T {
  const previousRef = useRef<T>(next);
  if (!isDeepEqual(previousRef.current, next)) {
    previousRef.current = next;
  }
  return previousRef.current;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDeepEqual(a: unknown, b: unknown, seen = new WeakMap()): boolean {
  if (Object.is(a, b)) return true;

  if (!isObjectLike(a) || !isObjectLike(b)) {
    return false;
  }

  if (seen.get(a) === b) return true;
  seen.set(a, b);

  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);
  if (aIsArray !== bIsArray) return false;

  if (aIsArray && bIsArray) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!isDeepEqual(a[i], b[i], seen)) return false;
    }
    return true;
  }

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.hasOwn(b, key)) return false;
    if (!isDeepEqual(a[key], b[key], seen)) return false;
  }

  return true;
}
