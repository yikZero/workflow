import type { Step } from '@workflow/world';
import type { ModelMessage } from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { parse as devalueParse } from 'devalue';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const durationFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

const MS_IN_SECOND = 1000;
const MS_IN_MINUTE = 60 * MS_IN_SECOND;
const MS_IN_HOUR = 60 * MS_IN_MINUTE;
const MS_IN_DAY = 24 * MS_IN_HOUR;

/**
 * Formats a duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @param compact - If true, returns a single-unit format (e.g., "45s", "2.5m").
 *                  If false (default), returns multi-part format (e.g., "1h 30m", "2d 5h").
 *
 * Compact format:
 * - < 1s: shows milliseconds (e.g., "500ms")
 * - < 1m: shows seconds (e.g., "45s")
 * - < 1h: shows minutes (e.g., "45m")
 * - >= 1h: shows hours (e.g., "2.5h")
 *
 * Full format:
 * - < 1s: shows milliseconds (e.g., "500ms")
 * - < 1m: shows seconds (e.g., "45.5s")
 * - >= 1m: shows human-readable format (e.g., "1h 30m", "2d 5h")
 */
export function formatDuration(ms: number, compact = false): string {
  if (ms === 0) {
    return '0';
  }

  // For durations less than 1 second, show milliseconds
  if (ms < MS_IN_SECOND) {
    return `${durationFormatter.format(ms)}ms`;
  }

  // For durations less than 1 minute, show seconds
  if (ms < MS_IN_MINUTE) {
    return `${durationFormatter.format(ms / MS_IN_SECOND)}s`;
  }

  // Compact format: single unit
  if (compact) {
    if (ms < MS_IN_HOUR) {
      return `${durationFormatter.format(ms / MS_IN_MINUTE)}m`;
    }
    return `${durationFormatter.format(ms / MS_IN_HOUR)}h`;
  }

  // Full format: human-readable multi-part
  const days = Math.floor(ms / MS_IN_DAY);
  const hours = Math.floor((ms % MS_IN_DAY) / MS_IN_HOUR);
  const minutes = Math.floor((ms % MS_IN_HOUR) / MS_IN_MINUTE);
  const seconds = Math.floor((ms % MS_IN_MINUTE) / MS_IN_SECOND);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (hours <= 1 && (seconds > 0 || parts.length === 0)) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}

/**
 * Returns a formatted pagination display string
 * @param currentPage - The current page number
 * @param totalPages - The total number of pages visited so far
 * @param hasMore - Whether there are more pages available
 * @returns Formatted string like "Page 1 of 3+" or "Page 2 of 2"
 */
export function getPaginationDisplay(
  currentPage: number,
  totalPages: number,
  hasMore: boolean
): string {
  if (hasMore) {
    return `Page ${currentPage} of ${totalPages}+`;
  }
  return `Page ${currentPage} of ${totalPages}`;
}

// ============================================================================
// Durable Agent Utilities
// ============================================================================

/**
 * Check if a step is a doStreamStep (LLM call with conversation input)
 */
export function isDoStreamStep(stepName: string): boolean {
  return stepName.endsWith('//doStreamStep');
}

/**
 * Extract the conversation from a hydrated doStreamStep input.
 * doStreamStep signature: (conversationPrompt, model, writable, tools, options)
 * So input[0] is the conversation.
 */
export function extractConversation(stepInput: unknown): ModelMessage[] | null {
  if (!Array.isArray(stepInput) || stepInput.length === 0) {
    return null;
  }

  const firstArg = stepInput[0];

  if (!Array.isArray(firstArg)) {
    return null;
  }

  // Validate it looks like ModelMessage[]
  if (
    !firstArg.every((msg) => msg && typeof msg === 'object' && 'role' in msg)
  ) {
    return null;
  }

  return firstArg as ModelMessage[];
}

/**
 * A doStreamStep with its conversation input extracted
 */
export interface StreamStep {
  stepId: string;
  stepName: string;
  displayName: string;
  conversation: ModelMessage[];
}

/**
 * Identifies all stream steps (doStreamStep) in a run and extracts their conversations.
 */
export function identifyStreamSteps(steps: Step[]): StreamStep[] {
  return steps
    .filter((step) => isDoStreamStep(step.stepName))
    .map((step) => {
      const functionName = step.stepName.split('//').pop() ?? 'unknown';
      const conversation = extractConversation(step.input) ?? [];

      return {
        stepId: step.stepId,
        stepName: step.stepName,
        displayName: functionName,
        conversation,
      };
    });
}

/**
 * Detect if a value looks like a serialized byte array (e.g. { "0": 100, "1": 101, ... })
 * and convert it to its UTF-8 string representation.
 */
function isByteObject(value: unknown): value is Record<string, number> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  // All keys must be sequential integers 0..n-1 and all values must be numbers (0-255)
  for (let i = 0; i < keys.length; i++) {
    if (!(String(i) in (value as Record<string, unknown>))) return false;
    const v = (value as Record<string, unknown>)[String(i)];
    if (typeof v !== 'number' || v < 0 || v > 255 || v !== Math.floor(v)) {
      return false;
    }
  }
  return keys.length === Object.keys(value).length;
}

/**
 * Detect if a value is a number array where all elements are byte-range
 * integers (0-255). This happens when a Uint8Array is serialized via
 * Array.from() and then JSON-stringified (e.g. in sanitizeWorkflowResponse).
 */
function isByteNumberArray(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  for (const v of value) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 255) {
      return false;
    }
  }
  return true;
}

function byteObjectToString(value: Record<string, number>): string {
  const bytes = new Uint8Array(Object.keys(value).length);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = value[String(i)];
  }
  return new TextDecoder().decode(bytes);
}

function byteArrayToString(value: number[]): string {
  return new TextDecoder().decode(new Uint8Array(value));
}

// ============================================================================
// Devalue deserialization for observability
// ============================================================================

const DEVALUE_PREFIX = 'devl';
const DEVALUE_PREFIX_LENGTH = 4;

const STREAM_REF_TYPE = '__workflow_stream_ref__';
const CLASS_INSTANCE_REF_TYPE = '__workflow_class_instance_ref__';

/**
 * Browser-safe base64 → ArrayBuffer decoder.
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  if (base64 === '.' || base64 === '') return new ArrayBuffer(0);
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Browser-safe revivers for devalue deserialization in observability context.
 * Handles common types for display purposes. Workflow-specific types
 * (streams, step functions, class instances) are converted to opaque markers.
 */
const observabilityRevivers: Record<string, (value: any) => any> = {
  ArrayBuffer: (v: string) =>
    `<ArrayBuffer:${base64ToArrayBuffer(v).byteLength}B>`,
  BigInt: (v: string) => BigInt(v),
  BigInt64Array: () => '<BigInt64Array>',
  BigUint64Array: () => '<BigUint64Array>',
  Date: (v: string) => (v === '.' ? new Date(NaN) : new Date(v)),
  Error: (v: { name: string; message: string; stack?: string }) => {
    const err = new Error(v.message);
    err.name = v.name;
    if (v.stack) err.stack = v.stack;
    return err;
  },
  Float32Array: () => '<Float32Array>',
  Float64Array: () => '<Float64Array>',
  Headers: (v: [string, string][]) => Object.fromEntries(v),
  Int8Array: () => '<Int8Array>',
  Int16Array: () => '<Int16Array>',
  Int32Array: () => '<Int32Array>',
  Map: (v: [unknown, unknown][]) => new Map(v),
  RegExp: (v: { source: string; flags: string }) =>
    new RegExp(v.source, v.flags),
  Set: (v: unknown[]) => new Set(v),
  URL: (v: string) => v,
  URLSearchParams: (v: string) => (v === '.' ? '' : v),
  Uint8Array: (v: string) => {
    const ab = base64ToArrayBuffer(v);
    return new Uint8Array(ab);
  },
  Uint8ClampedArray: () => '<Uint8ClampedArray>',
  Uint16Array: () => '<Uint16Array>',
  Uint32Array: () => '<Uint32Array>',
  ReadableStream: (v: any) => ({
    __type: STREAM_REF_TYPE,
    streamId: v.name ?? 'unknown',
  }),
  WritableStream: (v: any) => ({
    __type: STREAM_REF_TYPE,
    streamId: v.name ?? 'unknown',
  }),
  StepFunction: (v: any) => `<step:${v.stepId ?? 'unknown'}>`,
  Instance: (v: { classId: string; data: unknown }) => ({
    __type: CLASS_INSTANCE_REF_TYPE,
    className: v.classId?.split('/').pop() ?? 'Unknown',
    classId: v.classId,
    data: v.data,
  }),
  Class: (v: { classId: string }) =>
    `<class:${v.classId?.split('/').pop() ?? 'Unknown'}>`,
};

/**
 * Detect and deserialize a devalue-format string (prefixed with "devl").
 * Returns the deserialized value, or the original string if it's not devalue format.
 */
export function tryDeserializeDevalue(value: string): unknown {
  if (!value.startsWith(DEVALUE_PREFIX)) {
    return value;
  }
  try {
    const payload = value.slice(DEVALUE_PREFIX_LENGTH);
    return devalueParse(payload, observabilityRevivers);
  } catch {
    return value;
  }
}

/**
 * Detect and deserialize a devalue-format byte array.
 * The bytes should be: [devl prefix (4 bytes)][devalue-encoded payload].
 */
function tryDeserializeDevalueBytes(bytes: Uint8Array): unknown {
  if (bytes.length < DEVALUE_PREFIX_LENGTH) return bytes;
  const prefix = new TextDecoder().decode(
    bytes.subarray(0, DEVALUE_PREFIX_LENGTH)
  );
  if (prefix !== DEVALUE_PREFIX) return bytes;
  try {
    const payload = new TextDecoder().decode(
      bytes.subarray(DEVALUE_PREFIX_LENGTH)
    );
    return devalueParse(payload, observabilityRevivers);
  } catch {
    return bytes;
  }
}

/**
 * Attempt to deserialize a serialized data field (input/output) from any format:
 * - devalue-format string ("devl...")
 * - devalue-format Uint8Array (devl prefix + payload)
 * - number array (from Array.from(Uint8Array) via sanitizeWorkflowResponse)
 * - already-deserialized object (pass-through)
 */
export function tryDeserializeSerializedData(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // String starting with "devl" → devalue format
  if (typeof value === 'string') {
    return tryDeserializeDevalue(value);
  }

  // Uint8Array → try devalue binary format
  if (value instanceof Uint8Array) {
    return tryDeserializeDevalueBytes(value);
  }

  // Number array → could be Array.from(Uint8Array) from sanitizeWorkflowResponse
  if (
    Array.isArray(value) &&
    value.length > DEVALUE_PREFIX_LENGTH &&
    value.every(
      (v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255
    )
  ) {
    const bytes = new Uint8Array(value);
    const prefix = new TextDecoder().decode(
      bytes.subarray(0, DEVALUE_PREFIX_LENGTH)
    );
    if (prefix === DEVALUE_PREFIX) {
      return tryDeserializeDevalueBytes(bytes);
    }
    // Not devalue — try UTF-8 JSON decoding as fallback
    try {
      const str = new TextDecoder().decode(bytes);
      return JSON.parse(str);
    } catch {
      return value;
    }
  }

  // Already a non-array object — assumed deserialized
  return value;
}

/**
 * Recursively walk a value and convert any byte-array-like objects to strings.
 * Returns a new object (or the original if nothing changed).
 */
const MAX_DESERIALIZE_DEPTH = 100;

export function deserializeByteObjects(value: unknown): unknown {
  const activePath = new WeakSet<object>();

  const walk = (current: unknown, depth: number): unknown => {
    if (current === null || current === undefined) return current;
    if (typeof current !== 'object') return current;

    if (depth > MAX_DESERIALIZE_DEPTH) {
      return '[MaxDepthExceeded]';
    }

    if (activePath.has(current)) {
      return '[Circular]';
    }

    activePath.add(current);

    try {
      if (Array.isArray(current)) {
        // Check if the entire array is a byte array (serialized Uint8Array)
        if (isByteNumberArray(current)) {
          try {
            const str = byteArrayToString(current);
            try {
              return walk(JSON.parse(str), depth + 1);
            } catch {
              // JSON parse failed — try devalue in case bytes encode devl[…] data
              const devalued = tryDeserializeDevalue(str);
              if (devalued !== str) return walk(devalued, depth + 1);
              return str;
            }
          } catch {
            // Not decodable — treat as regular array
          }
        }
        return current.map((item) => walk(item, depth + 1));
      }

      if (isByteObject(current)) {
        try {
          const str = byteObjectToString(current);
          try {
            return walk(JSON.parse(str), depth + 1);
          } catch {
            // JSON parse failed — try devalue in case bytes encode devl[…] data
            const devalued = tryDeserializeDevalue(str);
            if (devalued !== str) return walk(devalued, depth + 1);
            return str;
          }
        } catch {
          return current;
        }
      }

      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(current)) {
        result[k] = walk(v, depth + 1);
      }
      return result;
    } finally {
      activePath.delete(current);
    }
  };

  return walk(value, 0);
}
