/**
 * Optimistic deep-inspection of run/step inputs and outputs for agent-related
 * data structures.  Each scanner is called recursively; the first match wins
 * for a given subtree (no further descent into matched objects).
 *
 * Designed to be easy to extend — add a new scanner function to `scanners`.
 */

import type { Step, WorkflowRun } from '@workflow/world';
import type { ModelMessage } from 'ai';
import { isEncryptedMarker } from './hydration';

// ─── Scan result types ──────────────────────────────────────────────

/** Display types the UI currently understands. */
export type AgentScanResultType = 'sandbox' | 'model-messages';

export interface AgentScanMatch {
  type: AgentScanResultType;
  value: unknown;
  source: {
    entityType: 'run' | 'step';
    entityId: string;
    field: 'input' | 'output';
  };
}

// ─── Scanner interface ──────────────────────────────────────────────

/**
 * A scanner inspects a single value at the current recursion depth.
 * Return `[type, convertedObject]` on match, or `undefined` to skip.
 */
type Scanner = (
  value: unknown,
  depth: number
) => [AgentScanResultType, unknown] | undefined;

// ─── ToolLoopTranscriptMessage → ModelMessage conversion ────────────
// Ported from ash: provider-messages.ts toLanguageModelMessages / toToolResultPart

function toToolResultPart(part: Record<string, unknown>) {
  const base = {
    toolCallId: part.toolCallId as string,
    toolName: part.toolName as string,
    type: 'tool-result' as const,
  };

  if (part.isError) {
    return {
      ...base,
      output:
        typeof part.output === 'string'
          ? { type: 'error-text' as const, value: part.output }
          : { type: 'error-json' as const, value: part.output },
    };
  }

  return {
    ...base,
    output: { type: 'json' as const, value: part.output },
  };
}

/**
 * Convert a ToolLoopTranscriptMessage array into AI-SDK-compatible
 * ModelMessage[].  Logic mirrors `toLanguageModelMessages` in ash.
 */
export function toModelMessages(messages: unknown[]): ModelMessage[] {
  return messages.map((raw) => {
    const message = raw as Record<string, unknown>;

    switch (message.role) {
      case 'assistant': {
        const content = message.content;
        return {
          role: 'assistant' as const,
          content:
            typeof content === 'string'
              ? content
              : (content as Record<string, unknown>[]).map((part) => {
                  switch (part.type) {
                    case 'text':
                      return {
                        type: 'text' as const,
                        text: part.text as string,
                      };
                    case 'tool-call':
                      return {
                        type: 'tool-call' as const,
                        toolCallId: part.toolCallId as string,
                        toolName: part.toolName as string,
                        input: part.input,
                      };
                    case 'tool-result':
                      return toToolResultPart(part);
                    default:
                      return { type: 'text' as const, text: String(part) };
                  }
                }),
        } as ModelMessage;
      }
      case 'system':
        return {
          role: 'system' as const,
          content: message.content,
        } as ModelMessage;
      case 'tool':
        return {
          role: 'tool' as const,
          content: (message.content as Record<string, unknown>[]).map(
            toToolResultPart
          ),
        } as ModelMessage;
      case 'user':
        return {
          role: 'user' as const,
          content: message.content,
        } as ModelMessage;
      default:
        return {
          role: 'user' as const,
          content: String(message),
        } as ModelMessage;
    }
  });
}

// ─── Individual scanners ────────────────────────────────────────────

/**
 * Detect RuntimeSandboxState (top-level) or RuntimeSandboxSessionState
 * (individual session record).
 */
const scanSandbox: Scanner = (value) => {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;

  // RuntimeSandboxState — { initializedSandboxNames: string[], sessions: ... }
  if (Array.isArray(v.initializedSandboxNames) && Array.isArray(v.sessions)) {
    return ['sandbox', value];
  }

  // RuntimeSandboxSessionState — { sandboxName, sessionKey, adapter }
  if (
    typeof v.sandboxName === 'string' &&
    typeof v.sessionKey === 'string' &&
    typeof v.adapter === 'string'
  ) {
    return ['sandbox', value];
  }

  return undefined;
};

/** Is `msg` shaped like a ToolLoopTranscriptMessage? */
function isToolLoopMessage(msg: unknown): boolean {
  if (!msg || typeof msg !== 'object') return false;
  const m = msg as Record<string, unknown>;
  if (!('role' in m) || !('content' in m)) return false;

  const role = m.role;
  if (role === 'tool') {
    return (
      Array.isArray(m.content) &&
      (m.content as Record<string, unknown>[]).every(
        (p) => p?.type === 'tool-result'
      )
    );
  }

  return role === 'assistant' || role === 'system' || role === 'user';
}

/**
 * Detect ToolLoopTranscriptMessage[] — distinguished from plain
 * ModelMessage[] by the presence of tool-loop-specific features
 * (tool messages, assistant content with tool-call/tool-result parts).
 */
const scanTranscriptMessages: Scanner = (value) => {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  if (!value.every(isToolLoopMessage)) return undefined;

  const hasToolLoopFeatures = value.some((msg: Record<string, unknown>) => {
    if (msg.role === 'tool') return true;
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      return (msg.content as Record<string, unknown>[]).some(
        (p) => p.type === 'tool-call' || p.type === 'tool-result'
      );
    }
    return false;
  });

  if (hasToolLoopFeatures) {
    return ['model-messages', toModelMessages(value)];
  }

  return undefined;
};

/**
 * Detect ModelMessage[] already in AI SDK format (role + content arrays
 * with at least one user or assistant message).
 */
const scanModelMessages: Scanner = (value) => {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const valid = value.every(
    (msg) => msg && typeof msg === 'object' && 'role' in msg && 'content' in msg
  );
  if (!valid) return undefined;

  const hasConversation = value.some(
    (msg: Record<string, unknown>) =>
      msg.role === 'user' || msg.role === 'assistant'
  );
  if (!hasConversation) return undefined;

  return ['model-messages', value];
};

/**
 * Detect RuntimeActionRequest[] — objects with `callId` and a `kind`
 * of "tool-call", "subagent-call", or "activate-skill".  Converts to
 * a synthetic assistant ModelMessage with tool-call parts.
 */
const scanActionRequests: Scanner = (value) => {
  if (!Array.isArray(value) || value.length === 0) return undefined;

  const isRequests = value.every((req) => {
    if (!req || typeof req !== 'object') return false;
    const r = req as Record<string, unknown>;
    return (
      typeof r.callId === 'string' &&
      typeof r.kind === 'string' &&
      ['tool-call', 'subagent-call', 'activate-skill'].includes(
        r.kind as string
      )
    );
  });

  if (!isRequests) return undefined;

  const parts = value.map((req: Record<string, unknown>) => ({
    type: 'tool-call' as const,
    toolCallId: req.callId as string,
    toolName:
      (req.toolName as string) ??
      (req.subagentName as string) ??
      'activate-skill',
    input: req.input ?? {},
  }));

  return ['model-messages', [{ role: 'assistant' as const, content: parts }]];
};

// ─── Scanner registry ───────────────────────────────────────────────

const scanners: Scanner[] = [
  scanSandbox,
  scanTranscriptMessages,
  scanModelMessages,
  scanActionRequests,
];

// ─── Recursive deep scan ────────────────────────────────────────────

const DEFAULT_MAX_DEPTH = 6;

function deepScan(
  value: unknown,
  depth: number,
  maxDepth: number,
  results: [AgentScanResultType, unknown][]
): void {
  if (depth > maxDepth) return;
  if (value == null || typeof value !== 'object') return;
  // Skip encrypted / display markers
  if (isEncryptedMarker(value)) return;

  for (const scanner of scanners) {
    const match = scanner(value, depth);
    if (match) {
      results.push(match);
      return; // Don't recurse into matched subtree
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      deepScan(item, depth + 1, maxDepth, results);
    }
  } else {
    for (const val of Object.values(value as Record<string, unknown>)) {
      deepScan(val, depth + 1, maxDepth, results);
    }
  }
}

/** Scan a single value tree and return all matches. */
export function scanValue(
  value: unknown,
  maxDepth = DEFAULT_MAX_DEPTH
): [AgentScanResultType, unknown][] {
  const results: [AgentScanResultType, unknown][] = [];
  deepScan(value, 0, maxDepth, results);
  return results;
}

// ─── Entity-level scanning ──────────────────────────────────────────

/** Scan a single run or step's input/output fields. */
export function scanEntity(
  entity: { input?: unknown; output?: unknown },
  entityType: 'run' | 'step',
  entityId: string
): AgentScanMatch[] {
  const matches: AgentScanMatch[] = [];
  for (const field of ['input', 'output'] as const) {
    const fieldValue = (entity as Record<string, unknown>)[field];
    if (fieldValue == null) continue;
    for (const [type, value] of scanValue(fieldValue)) {
      matches.push({ type, value, source: { entityType, entityId, field } });
    }
  }
  return matches;
}

/** Scan the run and all provided steps, returning every match. */
export function scanRunAndSteps(
  run: WorkflowRun,
  steps: Step[]
): AgentScanMatch[] {
  const matches = scanEntity(run, 'run', run.runId);
  for (const step of steps) {
    matches.push(...scanEntity(step, 'step', step.stepId));
  }
  return matches;
}

/** Quick predicate — returns true if any agent data is detected. */
export function hasAgentData(run: WorkflowRun, steps: Step[]): boolean {
  // Check run first (fast path)
  for (const field of ['input', 'output'] as const) {
    const v = (run as Record<string, unknown>)[field];
    if (v != null && scanValue(v).length > 0) return true;
  }
  for (const step of steps) {
    for (const field of ['input', 'output'] as const) {
      const v = (step as Record<string, unknown>)[field];
      if (v != null && scanValue(v).length > 0) return true;
    }
  }
  return false;
}
