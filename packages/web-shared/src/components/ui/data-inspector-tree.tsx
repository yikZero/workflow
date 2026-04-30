'use client';

/**
 * Reusable data inspector component with a compact JSON tree renderer.
 *
 * The tree presentation is intentionally closer to Vercel's newer JSON
 * rendering pattern: tighter spacing, click-to-expand labels, explicit
 * collapsed previews, and syntax-colored keys/values. Workflow-specific
 * badges (stream refs, run refs, decrypt actions) are preserved.
 */

import { Lock } from 'lucide-react';
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDarkMode } from '../../hooks/use-dark-mode';
import { ENCRYPTED_DISPLAY_NAME } from '../../lib/hydration';
import { Spinner } from './spinner';

// ---------------------------------------------------------------------------
// StreamRef / ClassInstanceRef type detection
// (inline to avoid circular deps with hydration module)
// ---------------------------------------------------------------------------

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

type TypedArrayValue =
  | BigInt64Array
  | BigUint64Array
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array;

function isStreamRef(value: unknown): value is StreamRef {
  if (value === null || typeof value !== 'object') return false;
  // Check both enumerable and non-enumerable __type (opaque refs use non-enumerable)
  const desc = Object.getOwnPropertyDescriptor(value, '__type');
  return desc?.value === STREAM_REF_TYPE;
}

function isRunRef(value: unknown): value is RunRef {
  if (value === null || typeof value !== 'object') return false;
  const desc = Object.getOwnPropertyDescriptor(value, '__type');
  return desc?.value === RUN_REF_TYPE;
}

function isClassInstanceRef(value: unknown): value is {
  __type: string;
  className: string;
  classId: string;
  data: unknown;
} {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__type' in value &&
    (value as Record<string, unknown>).__type === CLASS_INSTANCE_REF_TYPE
  );
}

function isTypedArray(value: unknown): value is TypedArrayValue {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function isEncryptedDisplay(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    value.constructor?.name === ENCRYPTED_DISPLAY_NAME
  );
}

// ---------------------------------------------------------------------------
// Stream / decrypt contexts
// ---------------------------------------------------------------------------

/**
 * Context for passing stream click handlers down to DataInspector instances.
 * Exported so that parent components (e.g., AttributePanel) can provide the handler.
 */
export const StreamClickContext = createContext<
  ((streamId: string) => void) | undefined
>(undefined);

/**
 * Context for passing a decrypt handler down to DataInspector instances.
 * When provided, encrypted markers become clickable buttons that trigger decryption.
 */
export type DecryptClickContextValue = {
  onDecrypt: () => void;
  isDecrypting: boolean;
};

export const DecryptClickContext = createContext<
  DecryptClickContextValue | undefined
>(undefined);

export const RunClickContext = createContext<
  ((runId: string) => void) | undefined
>(undefined);

function EncryptedInlineLabel() {
  const ctx = useContext(DecryptClickContext);
  if (ctx) {
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
        style={{
          backgroundColor: 'var(--ds-gray-100)',
          color: 'var(--ds-gray-700)',
          border: '1px solid var(--ds-gray-400)',
          fontStyle: 'italic',
          opacity: ctx.isDecrypting ? 0.6 : 1,
        }}
        disabled={ctx.isDecrypting}
        onClick={(event) => {
          event.stopPropagation();
          ctx.onDecrypt();
        }}
        title="Click to decrypt"
      >
        {ctx.isDecrypting ? (
          <Spinner size={12} />
        ) : (
          <Lock
            className="h-3 w-3"
            style={{ display: 'inline', flexShrink: 0 }}
          />
        )}
        <span>{ctx.isDecrypting ? 'Decrypting...' : 'Decrypt'}</span>
      </button>
    );
  }

  return (
    <span style={{ color: 'var(--ds-gray-600)', fontStyle: 'italic' }}>
      <Lock
        className="h-3 w-3"
        style={{
          display: 'inline',
          verticalAlign: 'middle',
          marginRight: '3px',
          marginTop: '-1px',
        }}
      />
      Encrypted
    </span>
  );
}

function StreamRefInline({ streamRef }: { streamRef: StreamRef }) {
  const onStreamClick = useContext(StreamClickContext);
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono underline decoration-transparent transition-colors"
      style={{
        backgroundColor: hovered ? 'var(--ds-blue-200)' : 'var(--ds-blue-100)',
        color: 'var(--ds-blue-900)',
        border: '1px solid var(--ds-blue-300)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(event) => {
        event.stopPropagation();
        onStreamClick?.(streamRef.streamId);
      }}
      title={`View stream: ${streamRef.streamId}`}
    >
      <span>📡</span>
      <span>{streamRef.streamId}</span>
    </button>
  );
}

function RunRefInline({ runRef }: { runRef: RunRef }) {
  const onRunClick = useContext(RunClickContext);
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono underline decoration-transparent transition-colors"
      style={{
        backgroundColor: hovered
          ? 'var(--ds-purple-200)'
          : 'var(--ds-purple-100)',
        color: 'var(--ds-purple-900)',
        border: '1px solid var(--ds-purple-300)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(event) => {
        event.stopPropagation();
        onRunClick?.(runRef.runId);
      }}
      title={`View run: ${runRef.runId}`}
    >
      <span>{runRef.runId}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// JSON tree rendering
// ---------------------------------------------------------------------------

type JsonPathSegment = number | string;

interface TreeEntry {
  key: string;
  pathSegment: JsonPathSegment;
  value: unknown;
}

interface TreePrefix {
  text: string;
  italic?: boolean;
}

interface CompositeDescriptor {
  close: ']' | '}';
  entries: TreeEntry[];
  open: '[' | '{';
  prefix?: TreePrefix;
}

interface JsonTreeStyles {
  boolean: CSSProperties;
  childContainer: CSSProperties;
  circular: CSSProperties;
  clickableKey: CSSProperties;
  collapsed: CSSProperties;
  container: CSSProperties;
  date: CSSProperties;
  iconButton: CSSProperties;
  key: CSSProperties;
  meta: CSSProperties;
  nullish: CSSProperties;
  number: CSSProperties;
  punctuation: CSSProperties;
  row: CSSProperties;
  string: CSSProperties;
}

interface JsonNodeProps {
  ancestors: object[];
  data: unknown;
  depth: number;
  expandLevel: number;
  expandedPaths: Record<string, boolean>;
  isLast: boolean;
  name?: string;
  onToggle: (pathKey: string, defaultExpanded: boolean) => void;
  path: JsonPathSegment[];
  styles: JsonTreeStyles;
}

interface JsonLeafRowProps {
  isLast: boolean;
  name?: string;
  prefix?: TreePrefix;
  styles: JsonTreeStyles;
  value: ReactNode;
}

interface JsonCompositeRowProps {
  ancestors: object[];
  depth: number;
  descriptor: CompositeDescriptor;
  expandLevel: number;
  expandedPaths: Record<string, boolean>;
  isLast: boolean;
  name?: string;
  onToggle: (pathKey: string, defaultExpanded: boolean) => void;
  path: JsonPathSegment[];
  styles: JsonTreeStyles;
}

function createTreeStyles(isDark: boolean): JsonTreeStyles {
  return {
    container: {
      color: 'var(--ds-gray-1000)',
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      lineHeight: '20px',
      overflowWrap: 'anywhere',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    },
    row: {
      display: 'block',
      margin: 0,
      padding: '0 0 0 18px',
    },
    childContainer: {
      margin: 0,
      padding: 0,
      paddingLeft: '2ch',
    },
    key: {
      color: isDark ? 'var(--ds-pink-700)' : 'var(--ds-pink-900)',
      fontWeight: 400,
    },
    clickableKey: {
      background: 'transparent',
      border: 0,
      color: isDark ? 'var(--ds-pink-700)' : 'var(--ds-pink-900)',
      cursor: 'pointer',
      font: 'inherit',
      fontWeight: 400,
      lineHeight: 'inherit',
      margin: 0,
      padding: 0,
      textAlign: 'left',
    },
    punctuation: {
      color: 'var(--ds-gray-1000)',
    },
    string: {
      color: isDark ? 'var(--ds-blue-700)' : 'var(--ds-green-900)',
    },
    number: {
      color: isDark ? 'var(--ds-blue-700)' : 'var(--ds-blue-900)',
    },
    boolean: {
      color: isDark ? 'var(--ds-amber-700)' : 'var(--ds-amber-900)',
    },
    nullish: {
      color: isDark ? 'var(--ds-gray-700)' : 'var(--ds-gray-900)',
    },
    date: {
      color: isDark ? 'var(--ds-pink-700)' : 'var(--ds-pink-900)',
    },
    meta: {
      color: isDark ? 'var(--ds-gray-700)' : 'var(--ds-gray-900)',
    },
    iconButton: {
      alignItems: 'center',
      background: 'transparent',
      border: 0,
      borderRadius: '4px',
      boxSizing: 'border-box',
      color: isDark ? '#fff' : 'var(--ds-gray-900)',
      cursor: 'pointer',
      display: 'inline-flex',
      fontFamily: 'inherit',
      fontSize: '14px',
      fontWeight: 600,
      justifyContent: 'center',
      lineHeight: 1,
      margin: 0,
      marginLeft: '-18px',
      minHeight: '18px',
      minWidth: '18px',
      padding: 0,
      userSelect: 'none',
      verticalAlign: 'middle',
    },
    collapsed: {
      color: isDark ? 'var(--ds-gray-700)' : 'var(--ds-gray-900)',
    },
    circular: {
      color: isDark ? 'var(--ds-gray-700)' : 'var(--ds-gray-900)',
      fontStyle: 'italic',
    },
  };
}

function DisclosureChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden="true"
      data-slot="geist-icon"
      height="14"
      viewBox="0 0 16 16"
      width="14"
      style={{
        color: 'currentcolor',
        display: 'block',
        transform: expanded ? 'rotate(90deg)' : 'none',
        transformOrigin: '50% 50%',
        transition: 'transform 120ms ease',
      }}
    >
      <path
        d="M10.1016 7.29297C10.4921 7.68349 10.4921 8.31651 10.1016 8.70703L6.74805 12.0605L5.6875 11L8.6875 8L5.6875 5L6.74805 3.93945L10.1016 7.29297Z"
        fill="currentColor"
      />
    </svg>
  );
}

function JsonTree({
  data,
  expandLevel,
  name,
}: {
  data: unknown;
  expandLevel: number;
  name?: string;
}) {
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>(
    {}
  );
  const isDark = useDarkMode();
  const styles = useMemo(() => createTreeStyles(isDark), [isDark]);

  return (
    <div style={styles.container}>
      <JsonNode
        ancestors={[]}
        data={data}
        depth={0}
        expandLevel={expandLevel}
        expandedPaths={expandedPaths}
        isLast
        name={name}
        onToggle={(pathKey, defaultExpanded) => {
          setExpandedPaths((current) => ({
            ...current,
            [pathKey]: !(current[pathKey] ?? defaultExpanded),
          }));
        }}
        path={[]}
        styles={styles}
      />
    </div>
  );
}

function JsonNode({
  ancestors,
  data,
  depth,
  expandLevel,
  expandedPaths,
  isLast,
  name,
  onToggle,
  path,
  styles,
}: JsonNodeProps) {
  if (isEncryptedDisplay(data)) {
    return (
      <JsonLeafRow
        isLast={isLast}
        name={name}
        styles={styles}
        value={<EncryptedInlineLabel />}
      />
    );
  }

  if (isStreamRef(data)) {
    return (
      <JsonLeafRow
        isLast={isLast}
        name={name}
        styles={styles}
        value={<StreamRefInline streamRef={data} />}
      />
    );
  }

  if (isRunRef(data)) {
    return (
      <JsonLeafRow
        isLast={isLast}
        name={name}
        styles={styles}
        value={<RunRefInline runRef={data} />}
      />
    );
  }

  if (isClassInstanceRef(data)) {
    const prefix = { italic: true, text: data.className } satisfies TreePrefix;
    const innerValue = data.data;

    if (isObjectLike(innerValue) && ancestors.includes(innerValue)) {
      return (
        <JsonLeafRow
          isLast={isLast}
          name={name}
          prefix={prefix}
          styles={styles}
          value={<span style={styles.circular}>[Circular]</span>}
        />
      );
    }

    const descriptor = getCompositeDescriptor(innerValue);
    if (descriptor) {
      return (
        <JsonCompositeRow
          ancestors={
            isObjectLike(innerValue) ? [...ancestors, innerValue] : ancestors
          }
          depth={depth}
          descriptor={{ ...descriptor, prefix }}
          expandLevel={expandLevel}
          expandedPaths={expandedPaths}
          isLast={isLast}
          name={name}
          onToggle={onToggle}
          path={path}
          styles={styles}
        />
      );
    }

    return (
      <JsonLeafRow
        isLast={isLast}
        name={name}
        prefix={prefix}
        styles={styles}
        value={formatInlineValue(innerValue, styles)}
      />
    );
  }

  if (isObjectLike(data) && ancestors.includes(data)) {
    return (
      <JsonLeafRow
        isLast={isLast}
        name={name}
        styles={styles}
        value={<span style={styles.circular}>[Circular]</span>}
      />
    );
  }

  const descriptor = getCompositeDescriptor(data);
  if (descriptor) {
    return (
      <JsonCompositeRow
        ancestors={isObjectLike(data) ? [...ancestors, data] : ancestors}
        depth={depth}
        descriptor={descriptor}
        expandLevel={expandLevel}
        expandedPaths={expandedPaths}
        isLast={isLast}
        name={name}
        onToggle={onToggle}
        path={path}
        styles={styles}
      />
    );
  }

  return (
    <JsonLeafRow
      isLast={isLast}
      name={name}
      styles={styles}
      value={formatInlineValue(data, styles)}
    />
  );
}

function JsonLeafRow({
  isLast,
  name,
  prefix,
  styles,
  value,
}: JsonLeafRowProps) {
  return (
    <div style={styles.row}>
      {name != null ? <span style={styles.key}>{name}</span> : null}
      {name != null ? <span style={styles.punctuation}>: </span> : null}
      {prefix ? (
        <span style={getPrefixStyle(prefix, styles)}>{prefix.text} </span>
      ) : null}
      {value}
      {!isLast ? <span style={styles.punctuation}>,</span> : null}
    </div>
  );
}

function JsonCompositeRow({
  ancestors,
  depth,
  descriptor,
  expandLevel,
  expandedPaths,
  isLast,
  name,
  onToggle,
  path,
  styles,
}: JsonCompositeRowProps) {
  if (descriptor.entries.length === 0) {
    return (
      <JsonLeafRow
        isLast={isLast}
        name={name}
        prefix={descriptor.prefix}
        styles={styles}
        value={
          <span style={styles.punctuation}>
            {descriptor.open}
            {descriptor.close}
          </span>
        }
      />
    );
  }

  const pathKey = JSON.stringify(path);
  const defaultExpanded = depth < expandLevel;
  const isExpanded = expandedPaths[pathKey] ?? defaultExpanded;

  const toggle = () => {
    onToggle(pathKey, defaultExpanded);
  };

  return (
    <>
      <div style={styles.row}>
        <button
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse node' : 'Expand node'}
          onClick={toggle}
          style={styles.iconButton}
          type="button"
        >
          <DisclosureChevron expanded={isExpanded} />
        </button>
        {name != null ? (
          <>
            <button onClick={toggle} style={styles.clickableKey} type="button">
              {name}
            </button>
            <span style={styles.punctuation}>: </span>
          </>
        ) : null}
        {descriptor.prefix ? (
          <span style={getPrefixStyle(descriptor.prefix, styles)}>
            {descriptor.prefix.text}{' '}
          </span>
        ) : null}
        <span style={styles.punctuation}>{descriptor.open}</span>
        {!isExpanded ? (
          <>
            <span style={styles.collapsed}>...</span>
            <span style={styles.punctuation}>{descriptor.close}</span>
            {!isLast ? <span style={styles.punctuation}>,</span> : null}
          </>
        ) : null}
      </div>
      {isExpanded ? (
        <>
          <div style={styles.childContainer}>
            {descriptor.entries.map((entry, index) => (
              <JsonNode
                key={JSON.stringify([...path, entry.pathSegment])}
                ancestors={ancestors}
                data={entry.value}
                depth={depth + 1}
                expandLevel={expandLevel}
                expandedPaths={expandedPaths}
                isLast={index === descriptor.entries.length - 1}
                name={entry.key}
                onToggle={onToggle}
                path={[...path, entry.pathSegment]}
                styles={styles}
              />
            ))}
          </div>
          <div style={styles.row}>
            <span style={styles.punctuation}>{descriptor.close}</span>
            {!isLast ? <span style={styles.punctuation}>,</span> : null}
          </div>
        </>
      ) : null}
    </>
  );
}

function getCompositeDescriptor(value: unknown): CompositeDescriptor | null {
  if (Array.isArray(value)) {
    return {
      close: ']',
      entries: Array.from({ length: value.length }, (_, index) => ({
        key: String(index),
        pathSegment: index,
        value: value[index],
      })),
      open: '[',
    };
  }

  if (value instanceof Map) {
    return {
      close: '}',
      entries: Array.from(value.entries(), ([entryKey, entryValue], index) => ({
        key: formatMapKey(entryKey, index),
        pathSegment: index,
        value: entryValue,
      })),
      open: '{',
      prefix: { text: `Map(${value.size})` },
    };
  }

  if (value instanceof Set) {
    return {
      close: ']',
      entries: Array.from(value.values(), (entryValue, index) => ({
        key: String(index),
        pathSegment: index,
        value: entryValue,
      })),
      open: '[',
      prefix: { text: `Set(${value.size})` },
    };
  }

  if (isTypedArray(value)) {
    return {
      close: ']',
      entries: getTypedArrayEntries(value),
      open: '[',
      prefix: { text: `${value.constructor.name}(${value.length})` },
    };
  }

  if (value instanceof Headers) {
    return {
      close: '}',
      entries: Array.from(value.entries(), ([entryKey, entryValue], index) => ({
        key: entryKey,
        pathSegment: `${entryKey}-${index}`,
        value: entryValue,
      })),
      open: '{',
      prefix: { text: 'Headers' },
    };
  }

  if (value instanceof URLSearchParams) {
    return {
      close: '}',
      entries: Array.from(value.entries(), ([entryKey, entryValue], index) => ({
        key: entryKey,
        pathSegment: `${entryKey}-${index}`,
        value: entryValue,
      })),
      open: '{',
      prefix: { text: 'URLSearchParams' },
    };
  }

  if (value instanceof Error) {
    return {
      close: '}',
      entries: getErrorEntries(value).map(([entryKey, entryValue]) => ({
        key: entryKey,
        pathSegment: entryKey,
        value: entryValue,
      })),
      open: '{',
      prefix: { text: value.name || 'Error' },
    };
  }

  if (
    value instanceof ArrayBuffer ||
    value instanceof DataView ||
    value instanceof Date ||
    value instanceof Promise ||
    value instanceof RegExp ||
    value instanceof URL ||
    value instanceof WeakMap ||
    value instanceof WeakSet
  ) {
    return null;
  }

  if (!isObjectLike(value)) {
    return null;
  }

  const constructorName = getConstructorName(value);
  return {
    close: '}',
    entries: Object.entries(value).map(([entryKey, entryValue]) => ({
      key: entryKey,
      pathSegment: entryKey,
      value: entryValue,
    })),
    open: '{',
    prefix:
      constructorName && constructorName !== 'Object'
        ? { text: constructorName }
        : undefined,
  };
}

function getErrorEntries(error: Error): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [];

  if (error.message) {
    entries.push(['message', error.message]);
  }
  if (error.stack) {
    entries.push(['stack', error.stack]);
  }

  const errorWithCause = error as Error & { cause?: unknown };
  if ('cause' in errorWithCause && errorWithCause.cause !== undefined) {
    entries.push(['cause', errorWithCause.cause]);
  }

  for (const [key, value] of Object.entries(error)) {
    if (!entries.some(([existingKey]) => existingKey === key)) {
      entries.push([key, value]);
    }
  }

  return entries;
}

function getTypedArrayEntries(value: TypedArrayValue): TreeEntry[] {
  const entries: TreeEntry[] = [];
  for (let index = 0; index < value.length; index += 1) {
    entries.push({
      key: String(index),
      pathSegment: index,
      value: value[index],
    });
  }
  return entries;
}

function formatInlineValue(value: unknown, styles: JsonTreeStyles): ReactNode {
  if (value === null) {
    return <span style={styles.nullish}>null</span>;
  }

  if (value === undefined) {
    return <span style={styles.nullish}>undefined</span>;
  }

  if (typeof value === 'string') {
    return <span style={styles.string}>{JSON.stringify(value)}</span>;
  }

  if (typeof value === 'number') {
    return <span style={styles.number}>{String(value)}</span>;
  }

  if (typeof value === 'bigint') {
    return <span style={styles.number}>{`${value}n`}</span>;
  }

  if (typeof value === 'boolean') {
    return <span style={styles.boolean}>{String(value)}</span>;
  }

  if (value instanceof Date) {
    return <span style={styles.date}>{value.toISOString()}</span>;
  }

  if (value instanceof RegExp) {
    return <span style={styles.meta}>{String(value)}</span>;
  }

  if (value instanceof URL) {
    return (
      <span style={styles.string}>{JSON.stringify(value.toString())}</span>
    );
  }

  if (value instanceof ArrayBuffer) {
    return (
      <span style={styles.meta}>{`ArrayBuffer(${value.byteLength})`}</span>
    );
  }

  if (value instanceof DataView) {
    return <span style={styles.meta}>{`DataView(${value.byteLength})`}</span>;
  }

  if (value instanceof WeakMap) {
    return <span style={styles.meta}>WeakMap</span>;
  }

  if (value instanceof WeakSet) {
    return <span style={styles.meta}>WeakSet</span>;
  }

  if (value instanceof Promise) {
    return <span style={styles.meta}>Promise</span>;
  }

  if (typeof value === 'function') {
    return (
      <span style={styles.meta}>
        [Function
        {value.name ? ` ${value.name}` : ''}]
      </span>
    );
  }

  if (typeof value === 'symbol') {
    return <span style={styles.meta}>{String(value)}</span>;
  }

  if (value instanceof Error) {
    return (
      <span
        style={styles.meta}
      >{`${value.name}${value.message ? `: ${value.message}` : ''}`}</span>
    );
  }

  if (isObjectLike(value)) {
    const constructorName = getConstructorName(value);
    return (
      <span style={styles.meta}>
        {constructorName && constructorName !== 'Object'
          ? constructorName
          : '{}'}
      </span>
    );
  }

  return <span style={styles.meta}>{String(value)}</span>;
}

function formatMapKey(key: unknown, index: number): string {
  if (typeof key === 'string') return key;
  if (
    typeof key === 'number' ||
    typeof key === 'boolean' ||
    typeof key === 'bigint'
  ) {
    return String(key);
  }
  if (key === null) return 'null';
  if (key === undefined) return 'undefined';
  if (key instanceof Date) return key.toISOString();
  if (key instanceof RegExp || key instanceof URL) return String(key);
  if (typeof key === 'symbol') return key.toString();
  return `entry ${index}`;
}

function getConstructorName(value: object): string | undefined {
  const prototype = Object.getPrototypeOf(value);
  const ctor = prototype?.constructor;
  if (typeof ctor !== 'function') return undefined;
  return ctor.name || undefined;
}

function getPrefixStyle(
  prefix: TreePrefix,
  styles: JsonTreeStyles
): CSSProperties {
  return prefix.italic ? { ...styles.meta, fontStyle: 'italic' } : styles.meta;
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface DataInspectorProps {
  /** The data to inspect */
  data: unknown;
  /** Initial expand depth (default: 3) */
  expandLevel?: number;
  /** Optional name for the root node */
  name?: string;
  /** Callback when a stream reference is clicked */
  onStreamClick?: (streamId: string) => void;
  /** Callback when a run reference is clicked */
  onRunClick?: (runId: string) => void;
  /** Callback when an encrypted marker is clicked (triggers decryption) */
  onDecrypt?: () => void;
  /** Whether decryption is currently in progress */
  isDecrypting?: boolean;
}

export function DataInspector({
  data,
  expandLevel = 3,
  name,
  onStreamClick,
  onRunClick,
  onDecrypt,
  isDecrypting = false,
}: DataInspectorProps) {
  const stableData = useStableInspectorData(data);
  let wrapped = (
    <JsonTree data={stableData} expandLevel={expandLevel} name={name} />
  );

  if (onStreamClick) {
    wrapped = (
      <StreamClickContext.Provider value={onStreamClick}>
        {wrapped}
      </StreamClickContext.Provider>
    );
  }

  if (onRunClick) {
    wrapped = (
      <RunClickContext.Provider value={onRunClick}>
        {wrapped}
      </RunClickContext.Provider>
    );
  }

  if (onDecrypt) {
    wrapped = (
      <DecryptClickContext.Provider value={{ isDecrypting, onDecrypt }}>
        {wrapped}
      </DecryptClickContext.Provider>
    );
  }

  return wrapped;
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

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags;
  }

  if (a instanceof URL && b instanceof URL) {
    return a.toString() === b.toString();
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a.entries()) {
      if (!b.has(key) || !isDeepEqual(value, b.get(key), seen)) return false;
    }
    return true;
  }

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const value of a.values()) {
      if (!b.has(value)) return false;
    }
    return true;
  }

  if (isTypedArray(a) && isTypedArray(b)) {
    if (a.constructor !== b.constructor || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }

  if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) {
    if (a.byteLength !== b.byteLength) return false;
    const left = new Uint8Array(a);
    const right = new Uint8Array(b);
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  if (a instanceof Headers && b instanceof Headers) {
    return isDeepEqual(Array.from(a.entries()), Array.from(b.entries()), seen);
  }

  if (a instanceof URLSearchParams && b instanceof URLSearchParams) {
    return a.toString() === b.toString();
  }

  if (a instanceof Error && b instanceof Error) {
    return (
      a.name === b.name &&
      a.message === b.message &&
      a.stack === b.stack &&
      isDeepEqual(Object.entries(a), Object.entries(b), seen)
    );
  }

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
