import type { Step } from '@workflow/world';
import type { ModelMessage } from 'ai';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MS_IN_SECOND = 1000;
const MS_IN_MINUTE = 60 * MS_IN_SECOND;
const MS_IN_HOUR = 60 * MS_IN_MINUTE;
const MS_IN_DAY = 24 * MS_IN_HOUR;

/**
 * Formats a duration in milliseconds to a human-readable string.
 *
 * @param ms - Duration in milliseconds
 * @param compact - If true, returns a compact format (e.g., "380ms", "2m 30s").
 *                  If false (default), returns multi-part format (e.g., "1m 13s", "2d 5h 3m 12s").
 *
 * Compact format (timeline markers):
 * - < 1s: shows milliseconds (e.g., "380ms")
 * - < 1m: shows seconds (e.g., "45s")
 * - < 1h: shows minutes and seconds (e.g., "2m 30s")
 * - >= 1h: shows hours and minutes (e.g., "2h 30m")
 *
 * Full format:
 * - < 1s: shows milliseconds (e.g., "380ms")
 * - < 1m: shows seconds (e.g., "45s")
 * - >= 1m: shows decomposed format with whole seconds (e.g., "1m 13s", "2m 13s")
 */
export function formatDuration(ms: number, compact = false): string {
  if (ms === 0) {
    return '0s';
  }

  if (ms < MS_IN_SECOND) {
    const roundedMs = Math.round(ms);
    return roundedMs < MS_IN_SECOND ? `${roundedMs}ms` : '1s';
  }

  const roundedMs = Math.round(ms / MS_IN_SECOND) * MS_IN_SECOND;

  if (roundedMs < MS_IN_MINUTE) {
    return `${Math.floor(roundedMs / MS_IN_SECOND)}s`;
  }

  // Compact format: multi-unit without decimals (e.g. "8m 20s", "2h 30m")
  if (compact) {
    if (roundedMs < MS_IN_HOUR) {
      const m = Math.floor(roundedMs / MS_IN_MINUTE);
      const s = Math.floor((roundedMs % MS_IN_MINUTE) / MS_IN_SECOND);
      return s > 0 ? `${m}m ${s}s` : `${m}m`;
    }
    const h = Math.floor(roundedMs / MS_IN_HOUR);
    const m = Math.floor((roundedMs % MS_IN_HOUR) / MS_IN_MINUTE);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  // Full format: decompose into larger units + whole seconds.
  const days = Math.floor(roundedMs / MS_IN_DAY);
  const hours = Math.floor((roundedMs % MS_IN_DAY) / MS_IN_HOUR);
  const minutes = Math.floor((roundedMs % MS_IN_HOUR) / MS_IN_MINUTE);
  const seconds = Math.floor((roundedMs % MS_IN_MINUTE) / MS_IN_SECOND);

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
  parts.push(`${seconds}s`);

  return parts.join(' ');
}

/**
 * Formats a duration in milliseconds with as much precision as can fit in
 * a compact label, without rounding up to the next-larger unit.
 *
 * Unlike `formatDuration`, this preserves sub-second / sub-minute detail so
 * the displayed value never overstates the underlying duration (e.g. 1500ms
 * renders as `1.5s` rather than `2s`). Use for hover labels, detail panes,
 * and other places where the value is meant to be read as an exact figure.
 *
 * Format:
 * - < 1s: integer milliseconds (e.g. `380ms`)
 * - < 1m: seconds with up to 2 decimal places, trailing zeros trimmed
 *   (e.g. `1.5s`, `12.34s`, `59.99s`)
 * - < 1h: `Xm Y.Zs` with one decimal of seconds (e.g. `1m 5.2s`)
 * - >= 1h / >= 1d: same decomposition as `formatDuration`, but seconds are
 *   floored rather than rounded so the label can't exceed the true value.
 */
export function formatDurationPrecise(ms: number): string {
  if (ms === 0) {
    return '0s';
  }

  if (ms < MS_IN_SECOND) {
    return `${Math.round(ms)}ms`;
  }

  if (ms < MS_IN_MINUTE) {
    const s = ms / MS_IN_SECOND;
    return `${trimTrailingZeros(s.toFixed(2))}s`;
  }

  if (ms < MS_IN_HOUR) {
    const m = Math.floor(ms / MS_IN_MINUTE);
    const s = (ms % MS_IN_MINUTE) / MS_IN_SECOND;
    if (s === 0) {
      return `${m}m`;
    }
    return `${m}m ${trimTrailingZeros(s.toFixed(1))}s`;
  }

  const days = Math.floor(ms / MS_IN_DAY);
  const hours = Math.floor((ms % MS_IN_DAY) / MS_IN_HOUR);
  const minutes = Math.floor((ms % MS_IN_HOUR) / MS_IN_MINUTE);
  const seconds = Math.floor((ms % MS_IN_MINUTE) / MS_IN_SECOND);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function trimTrailingZeros(value: string): string {
  if (!value.includes('.')) return value;
  return value.replace(/\.?0+$/, '');
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
