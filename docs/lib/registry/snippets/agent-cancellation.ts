/**
 * Source snippets for the Agent Cancellation registry entry.
 *
 * Drop-in cancellation pattern for any `DurableAgent`. The workflow races the
 * agent against a `stopHook` keyed by the run ID; when the user clicks the
 * Stop button, the route resumes the hook and the workflow exits cleanly,
 * emitting a final `data-stopped` part to the stream so the client renders a
 * clean ending. Falls back to `getRun(runId).cancel()` if the hook is already
 * gone.
 *
 * IMPORTANT: this pattern does NOT cancel the underlying model stream.
 * Tokens generated after the stop signal are still produced (and billed).
 * What it DOES is exit the workflow function as soon as the hook fires and
 * notify the client. For hard cross-process cancellation that signals the
 * inner step to bail out, see the Distributed Abort Controller cookbook.
 */

export const agentCancellationWorkflowSource = `import { DurableAgent } from "@workflow/ai/agent";
import {
  defineHook,
  getWorkflowMetadata,
  getWritable,
} from "workflow";
import { z } from "zod";
import type { ModelMessage, UIMessageChunk } from "ai";

// Hook resumed by the stop API route.
export const stopHook = defineHook({
  schema: z.object({ reason: z.string().optional() }),
});

// Replace these with your real tools.
async function searchWeb({ query }: { query: string }) {
  "use step";
  await new Promise((r) => setTimeout(r, 1500));
  return {
    results: [{ title: \`\${query} — overview\`, snippet: \`Result for \${query}.\` }],
  };
}

async function emitStopSignal(details: { reason?: string }) {
  "use step";
  const writer = getWritable<UIMessageChunk>().getWriter();
  try {
    await writer.write({
      type: "data-stopped",
      id: "stop-signal",
      data: details,
    } as UIMessageChunk);
  } finally {
    writer.releaseLock();
  }
}

export async function stoppableAgent(messages: ModelMessage[]) {
  "use workflow";

  // Token derived from the run ID so the stop API can resume by runId
  // alone — no extra bookkeeping required.
  const { workflowRunId } = getWorkflowMetadata();
  const hook = stopHook.create({ token: \`stop:\${workflowRunId}\` });

  const agent = new DurableAgent({
    model: "anthropic/claude-haiku-4.5",
    instructions: "You are a research assistant. Search and summarize as needed.",
    tools: {
      searchWeb: {
        description: "Search the web for information",
        inputSchema: z.object({ query: z.string() }),
        execute: searchWeb,
      },
    },
  });

  // Race the agent against the stop hook. When the hook fires, the workflow
  // exits at its next \`await\` boundary; the underlying model stream may keep
  // generating tokens in the background.
  const result = await Promise.race([
    agent
      .stream({
        messages,
        writable: getWritable<UIMessageChunk>(),
        maxSteps: 15,
      })
      .then((r) => ({ type: "complete" as const, messages: r.messages })),
    hook.then(({ reason }) => ({ type: "stopped" as const, reason })),
  ]);

  // Emit a final stream part on stop so the client renders a clean ending.
  if (result.type === "stopped") {
    await emitStopSignal({ reason: result.reason });
  }

  return result;
}
`;

export const agentCancellationStartRouteSource = `import type { UIMessage } from "ai";
import { convertToModelMessages, createUIMessageStreamResponse } from "ai";
import { start } from "workflow/api";
import { stoppableAgent } from "@/workflows/stoppable-agent";

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const modelMessages = await convertToModelMessages(messages);

  const run = await start(stoppableAgent, [modelMessages]);

  return createUIMessageStreamResponse({
    stream: run.readable,
    headers: { "x-workflow-run-id": run.runId },
  });
}
`;

export const agentCancellationRouteSource = `import { getRun } from "workflow/api";
import { NextResponse } from "next/server";
import { stopHook } from "@/workflows/stoppable-agent";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const { reason } = (await req.json().catch(() => ({}))) as {
    reason?: string;
  };

  // Try the graceful Stop Signal first.
  try {
    await stopHook.resume(\`stop:\${runId}\`, {
      reason: reason ?? "User requested stop",
    });
    return NextResponse.json({ success: true, mode: "stop-signal" });
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : "";
    if (!msg.includes("not found") && !msg.includes("expired")) {
      throw error;
    }
    // Hook already consumed (e.g. agent finished, race resolved). Fall back
    // to hard cancel so the run is definitely terminated.
    try {
      await getRun(runId).cancel();
    } catch {
      // Run already in a terminal state — nothing to do.
    }
    return NextResponse.json({ success: true, mode: "hard-cancel" });
  }
}
`;

export const agentCancellationButtonSource = `"use client";

import { useState } from "react";

interface StopButtonProps {
  /** Active workflow run ID (forwarded from \`x-workflow-run-id\` header). */
  runId: string | null | undefined;
  /** Endpoint pattern; \`{runId}\` will be substituted. */
  endpoint?: string;
  /** Optional className override. */
  className?: string;
}

export function StopButton({
  runId,
  endpoint = "/api/agent/{runId}/stop",
  className,
}: StopButtonProps) {
  const [stopping, setStopping] = useState(false);

  if (!runId) return null;

  const handleStop = async () => {
    setStopping(true);
    try {
      await fetch(endpoint.replace("{runId}", runId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "User clicked stop" }),
      });
    } finally {
      setStopping(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleStop}
      disabled={stopping}
      className={
        className ??
        "px-3 py-1.5 text-sm rounded-md border hover:bg-muted disabled:opacity-50"
      }
    >
      {stopping ? "Stopping…" : "Stop"}
    </button>
  );
}
`;

export const agentCancellationUsageSource = `// In your chat client, capture the runId from the response header on the
// FIRST message and render the Stop button while the agent is streaming:
"use client";

import { useChat } from "@ai-sdk/react";
import { useState } from "react";
import { StopButton } from "@/components/stop-button";

export function Chat() {
  const [runId, setRunId] = useState<string | null>(null);

  const { messages, sendMessage, status } = useChat({
    api: "/api/agent",
    onResponse(res) {
      const id = res.headers.get("x-workflow-run-id");
      if (id) setRunId(id);
    },
  });

  return (
    <div>
      {/* Render messages, including a "stopped" line if you see a
          \`data-stopped\` part. */}
      {messages.map((m) => (
        <div key={m.id}>{/* render parts */}</div>
      ))}

      {/* Show Stop only while the agent is actively streaming. */}
      {status === "streaming" && (
        <StopButton runId={runId} endpoint="/api/agent/{runId}/stop" />
      )}
    </div>
  );
}
`;
