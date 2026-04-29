/**
 * Source snippets for the Chat SDK registry entry.
 *
 * Each export is a raw string of source code that the detail page renders
 * with shiki. The canonical reference for these snippets is the Chat SDK
 * cookbook integration — `content/docs/cookbook/integrations/chat-sdk.mdx`.
 *
 * The pattern: one conversation thread = one durable workflow run. Chat
 * SDK's thread state holds the `runId`, so inbound messages route to a
 * `start()` (first message) or `resumeHook()` (every subsequent message).
 * Outbound chat side-effects (`thread.post`, `thread.subscribe`, …) live
 * inside `"use step"` functions that dynamically import the bot — keeps
 * adapter packages out of the workflow sandbox.
 *
 * Note on escaping: template literal placeholders inside the snippet are
 * escaped as `\${...}` so they stay literal here.
 */

export const chatSdkBotSource = `import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createRedisState } from "@chat-adapter/state-redis";

const adapters = {
  slack: createSlackAdapter(),
};

// The thread-level state stored by Chat SDK. \`runId\` ties a conversation
// thread to its durable workflow session.
export interface ThreadState {
  runId?: string;
}

// \`registerSingleton()\` is required: Chat SDK re-hydrates \`Thread\` objects
// inside step functions and needs a registered singleton to resolve
// adapters and state for those rehydrated instances.
export const bot = new Chat<typeof adapters, ThreadState>({
  userName: "durable-bot",
  adapters,
  state: createRedisState(),
  dedupeTtlMs: 600_000,
}).registerSingleton();
`;

export const chatSdkWorkflowSource = `import { Message, reviver, type Thread } from "chat";
import { defineHook, getWorkflowMetadata } from "workflow";
import type { ThreadState } from "@/lib/bot";

// Hook payload type lives in its own file so the webhook side can import
// it without pulling in the workflow module.
import type { ChatTurnPayload } from "@/workflows/chat-turn-hook";

const chatTurnHook = defineHook<ChatTurnPayload>();

// Posting back to the platform is a step — adapter packages use Node-only
// modules that aren't available in the workflow sandbox, so we import the
// bot dynamically from inside the step body.
async function postAssistantMessage(
  thread: Thread<ThreadState>,
  text: string
) {
  "use step";
  const { bot } = await import("@/lib/bot");
  await bot.initialize();
  await thread.post(text);
}

async function runTurn(text: string) {
  "use step";
  // Your AI SDK call, database lookup, tool loop, etc.
  return \`You said: \${text}\`;
}

async function handleMessage(
  thread: Thread<ThreadState>,
  message: Message
) {
  const text = message.text.trim();
  if (text.toLowerCase() === "done") return false;

  const reply = await runTurn(text);
  await postAssistantMessage(thread, reply);
  return true;
}

export async function durableChatSession(payload: string) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();

  // The handler serializes \`thread\` + \`message\` with \`toJSON()\`; we revive
  // them here using Chat SDK's standalone \`reviver\`.
  const { thread, message } = JSON.parse(payload, reviver) as {
    thread: Thread<ThreadState>;
    message: Message;
  };

  const hook = chatTurnHook.create({ token: workflowRunId });

  await postAssistantMessage(
    thread,
    "Session started. Reply here; send \\\`done\\\` to stop."
  );

  if (!(await handleMessage(thread, message))) return;

  // One hook resumption = one turn. The workflow stays suspended between
  // messages — zero compute cost while idle.
  while (true) {
    const { message: nextRaw } = await hook;
    const next = Message.fromJSON(nextRaw);
    if (!(await handleMessage(thread, next))) return;
  }
}
`;

export const chatSdkHookTypeSource = `import type { SerializedMessage } from "chat";

// Importing this from the handler module keeps adapter dependencies out
// of the workflow's import graph.
export type ChatTurnPayload = {
  message: SerializedMessage;
};
`;

export const chatSdkHandlersSource = `import type { Message, Thread } from "chat";
import { getRun, resumeHook, start } from "workflow/api";
import { bot, type ThreadState } from "@/lib/bot";
import { durableChatSession } from "@/workflows/durable-chat-session";
import type { ChatTurnPayload } from "@/workflows/chat-turn-hook";

async function startSession(
  thread: Thread<ThreadState>,
  message: Message
) {
  const run = await start(durableChatSession, [
    JSON.stringify({
      thread: thread.toJSON(),
      message: message.toJSON(),
    }),
  ]);
  await thread.setState({ runId: run.runId });
}

async function routeTurn(
  thread: Thread<ThreadState>,
  message: Message
) {
  const state = await thread.state;

  // No run yet, or the previous run finished — start fresh.
  if (!state?.runId || !(await getRun(state.runId).exists)) {
    await startSession(thread, message);
    return;
  }

  try {
    await resumeHook<ChatTurnPayload>(state.runId, {
      message: message.toJSON(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("not found") || msg.includes("expired")) {
      // Stale runId — start a new session rather than dropping the message.
      await startSession(thread, message);
      return;
    }
    throw err;
  }
}

bot.onNewMention(async (thread, message) => {
  await thread.subscribe();
  await routeTurn(thread, message);
});

bot.onSubscribedMessage(async (thread, message) => {
  await routeTurn(thread, message);
});
`;

export const chatSdkWebhookSource = `import "@/lib/chat-session-handlers";
import { after } from "next/server";
import { bot } from "@/lib/bot";

type Platform = keyof typeof bot.webhooks;

// Catch-all webhook route. Importing \`chat-session-handlers\` for its
// side-effects registers the event handlers before the first webhook
// arrives.
export async function POST(
  req: Request,
  ctx: RouteContext<"/api/webhooks/[platform]">
) {
  const { platform } = await ctx.params;
  const handler = bot.webhooks[platform as Platform];
  if (!handler) {
    return new Response(\`Unknown platform: \${platform}\`, { status: 404 });
  }

  return handler(req, { waitUntil: (task) => after(() => task) });
}
`;
