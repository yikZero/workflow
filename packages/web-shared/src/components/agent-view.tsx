'use client';

import type { Step, WorkflowRun } from '@workflow/world';
import type { ModelMessage } from 'ai';
import { Box, ExternalLink, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { type AgentScanMatch, scanRunAndSteps } from '../lib/agent-scan';
import { isEncryptedMarker } from '../lib/hydration';
import { ConversationView } from './sidebar/conversation-view';
import { DecryptButton } from './ui/decrypt-button';
import { Spinner } from './ui/spinner';

// ─── Types ──────────────────────────────────────────────────────────

interface ConversationEntry {
  /** Step ID or run ID */
  entityId: string;
  /** Which field the conversation was found in */
  field: 'input' | 'output';
  messages: ModelMessage[];
  /** Timestamp for display (createdAt of the step, or undefined for run) */
  timestamp?: Date;
}

interface UniqueSandbox {
  sandboxName: string;
  adapter: string;
  sessionKey: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Format a relative timestamp for the sidebar. */
function formatRelativeTime(date: Date | undefined): string {
  if (!date) return '';
  const now = Date.now();
  const diff = now - date.getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString();
}

/** Collect unique sandboxes from all sandbox scan matches. */
function collectUniqueSandboxes(matches: AgentScanMatch[]): UniqueSandbox[] {
  const seen = new Map<string, UniqueSandbox>();
  for (const match of matches) {
    if (match.type !== 'sandbox') continue;
    const v = match.value as Record<string, unknown>;

    if (Array.isArray(v.sessions)) {
      for (const session of v.sessions as Record<string, unknown>[]) {
        const key = session.sessionKey as string;
        if (!seen.has(key)) {
          seen.set(key, {
            sandboxName: session.sandboxName as string,
            adapter: session.adapter as string,
            sessionKey: key,
          });
        }
      }
    } else if (typeof v.sessionKey === 'string') {
      if (!seen.has(v.sessionKey as string)) {
        seen.set(v.sessionKey as string, {
          sandboxName: v.sandboxName as string,
          adapter: v.adapter as string,
          sessionKey: v.sessionKey as string,
        });
      }
    }
  }
  return Array.from(seen.values());
}

/** Collect per-step conversation entries, sorted by step ID (chronological). */
function collectConversations(
  matches: AgentScanMatch[],
  steps: Step[]
): ConversationEntry[] {
  const stepMap = new Map(steps.map((s) => [s.stepId, s]));
  const entries: ConversationEntry[] = [];
  for (const match of matches) {
    if (match.type !== 'model-messages') continue;
    const messages = match.value as ModelMessage[];
    if (messages.length === 0) continue;
    const step = stepMap.get(match.source.entityId);
    entries.push({
      entityId: match.source.entityId,
      field: match.source.field,
      messages,
      timestamp: step?.createdAt,
    });
  }
  // Sort by step ID (ULID = chronological order)
  entries.sort((a, b) => a.entityId.localeCompare(b.entityId));
  return entries;
}

// ─── Sandbox panel (right column) ───────────────────────────────────

function SandboxPanel({
  sandboxes,
  teamSlug,
  projectSlug,
}: {
  sandboxes: UniqueSandbox[];
  teamSlug?: string;
  projectSlug?: string;
}) {
  if (sandboxes.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3
        className="text-[11px] font-medium uppercase tracking-wide px-1"
        style={{ color: 'var(--ds-gray-700)' }}
      >
        Sandboxes
      </h3>
      {sandboxes.map((sandbox) => {
        const canLink = Boolean(teamSlug && projectSlug);
        const href = canLink
          ? `https://vercel.com/${teamSlug}/${projectSlug}/sandboxes/${sandbox.sessionKey}`
          : undefined;

        return (
          <div
            key={sandbox.sessionKey}
            className="rounded-md border px-2.5 py-2 text-[11px]"
            style={{
              borderColor: 'var(--ds-gray-300)',
              backgroundColor: 'var(--ds-gray-100)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 min-w-0">
                <Box
                  size={11}
                  className="shrink-0"
                  style={{ color: 'var(--ds-gray-700)' }}
                />
                <span
                  className="font-medium font-mono truncate"
                  style={{ color: 'var(--ds-gray-1000)' }}
                >
                  {sandbox.sandboxName}
                </span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                <span
                  className="rounded-full border px-1.5 py-0.5 text-[10px]"
                  style={{
                    borderColor: 'var(--ds-gray-300)',
                    color: 'var(--ds-gray-700)',
                  }}
                >
                  {sandbox.adapter}
                </span>
                {href && (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open in Vercel"
                    style={{ color: 'var(--ds-gray-700)' }}
                  >
                    <ExternalLink size={11} />
                  </a>
                )}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Step sidebar (left column) ─────────────────────────────────────

function StepSidebar({
  conversations,
  selectedIndex,
  onSelect,
}: {
  conversations: ConversationEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3
        className="text-[11px] font-medium uppercase tracking-wide px-2 pb-1"
        style={{ color: 'var(--ds-gray-700)' }}
      >
        Steps
      </h3>
      {conversations.map((entry, i) => {
        const isSelected = i === selectedIndex;
        const stepNumber = i + 1;
        return (
          <button
            key={`${entry.entityId}-${entry.field}`}
            type="button"
            onClick={() => onSelect(i)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors"
            style={{
              backgroundColor: isSelected
                ? 'var(--ds-gray-200)'
                : 'transparent',
              color: isSelected ? 'var(--ds-gray-1000)' : 'var(--ds-gray-900)',
              border: 'none',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <span
              className="shrink-0 font-mono text-[10px] tabular-nums"
              style={{ color: 'var(--ds-gray-700)' }}
            >
              #{stepNumber}
            </span>
            <span
              className="truncate text-[11px]"
              style={{ color: 'var(--ds-gray-700)' }}
            >
              {formatRelativeTime(entry.timestamp)}
            </span>
            <span
              className="ml-auto shrink-0 text-[10px] tabular-nums"
              style={{ color: 'var(--ds-gray-700)' }}
            >
              {entry.messages.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────

export interface AgentViewProps {
  run: WorkflowRun;
  steps: Step[];
  /** Whether step data is currently being loaded */
  isLoading?: boolean;
  /** Callback to initiate decryption of encrypted run data */
  onDecrypt?: () => void;
  /** Whether the encryption key is currently being fetched */
  isDecrypting?: boolean;
  /** Encryption key (available after decryption) */
  encryptionKey?: Uint8Array;
  /** Team slug for sandbox deep-links (e.g. "vercel-labs") */
  teamSlug?: string;
  /** Project slug for sandbox deep-links (e.g. "d0-agent-ash") */
  projectSlug?: string;
}

/**
 * Top-level Agent tab view. Three-column layout:
 * - Left: step list sidebar (conversations)
 * - Center: chat history for the selected step
 * - Right: sandbox resources
 */
export function AgentView({
  run,
  steps,
  isLoading,
  onDecrypt,
  isDecrypting,
  encryptionKey,
  teamSlug,
  projectSlug,
}: AgentViewProps) {
  const hasEncryptedData = useMemo(() => {
    for (const entity of [run, ...steps]) {
      const e = entity as Record<string, unknown>;
      if (isEncryptedMarker(e.input) || isEncryptedMarker(e.output)) {
        return true;
      }
    }
    return false;
  }, [run, steps]);

  const needsDecryption = hasEncryptedData && !encryptionKey;

  const matches = useMemo(() => scanRunAndSteps(run, steps), [run, steps]);

  const conversations = useMemo(
    () => collectConversations(matches, steps),
    [matches, steps]
  );

  const sandboxes = useMemo(() => collectUniqueSandboxes(matches), [matches]);

  // Default to the longest conversation
  const defaultIndex = useMemo(() => {
    if (conversations.length === 0) return 0;
    let maxIdx = 0;
    let maxLen = 0;
    for (let i = 0; i < conversations.length; i++) {
      if (conversations[i].messages.length > maxLen) {
        maxLen = conversations[i].messages.length;
        maxIdx = i;
      }
    }
    return maxIdx;
  }, [conversations]);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const activeIndex = selectedIndex ?? defaultIndex;

  // ── Loading / encrypted / empty states ──────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16">
        <Spinner size={16} />
        <span className="text-[13px]" style={{ color: 'var(--ds-gray-600)' }}>
          Loading step data…
        </span>
      </div>
    );
  }

  if (needsDecryption) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <Lock className="h-8 w-8" style={{ color: 'var(--ds-gray-600)' }} />
        <p className="text-[13px]" style={{ color: 'var(--ds-gray-600)' }}>
          Run data is encrypted. Decrypt to scan for agent data.
        </p>
        {onDecrypt && (
          <DecryptButton
            decrypted={false}
            loading={isDecrypting}
            onClick={onDecrypt}
          />
        )}
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div
        className="flex items-center justify-center py-16 text-[13px]"
        style={{ color: 'var(--ds-gray-600)' }}
      >
        No agent data detected
      </div>
    );
  }

  const activeConversation = conversations[activeIndex];

  // ── Three-column layout ─────────────────────────────────────────
  return (
    <div className="flex h-full">
      {/* Left sidebar — step list */}
      {conversations.length > 0 && (
        <div
          className="w-52 shrink-0 overflow-y-auto border-r p-2"
          style={{ borderColor: 'var(--ds-gray-300)' }}
        >
          <StepSidebar
            conversations={conversations}
            selectedIndex={activeIndex}
            onSelect={setSelectedIndex}
          />
        </div>
      )}

      {/* Center — conversation */}
      <div className="flex-1 min-w-0 overflow-y-auto flex flex-col">
        {activeConversation ? (
          <>
            <div
              className="shrink-0 border-b px-3 py-2 font-mono text-[11px]"
              style={{
                borderColor: 'var(--ds-gray-300)',
                color: 'var(--ds-gray-700)',
              }}
            >
              {activeConversation.entityId}
            </div>
            <div className="flex-1 overflow-y-auto">
              <ConversationView messages={activeConversation.messages} />
            </div>
          </>
        ) : (
          <div
            className="flex items-center justify-center py-16 text-[13px]"
            style={{ color: 'var(--ds-gray-600)' }}
          >
            No conversations found
          </div>
        )}
      </div>

      {/* Right sidebar — sandboxes / resources */}
      {sandboxes.length > 0 && (
        <div
          className="w-56 shrink-0 overflow-y-auto border-l p-2"
          style={{ borderColor: 'var(--ds-gray-300)' }}
        >
          <SandboxPanel
            sandboxes={sandboxes}
            teamSlug={teamSlug}
            projectSlug={projectSlug}
          />
        </div>
      )}
    </div>
  );
}
