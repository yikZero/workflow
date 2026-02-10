import type { Step } from '@workflow/world';
import type { ModelMessage } from 'ai';
import { type ClassValue, clsx } from 'clsx';
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

function byteObjectToString(value: Record<string, number>): string {
  const bytes = new Uint8Array(Object.keys(value).length);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = value[String(i)];
  }
  return new TextDecoder().decode(bytes);
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
        return current.map((item) => walk(item, depth + 1));
      }

      if (isByteObject(current)) {
        try {
          const str = byteObjectToString(current);
          // Try to parse as JSON in case the bytes encode a JSON string
          try {
            return walk(JSON.parse(str), depth + 1);
          } catch {
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
