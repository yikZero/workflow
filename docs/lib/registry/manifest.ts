import {
  aiSdkClientSource,
  aiSdkRouteSource,
  aiSdkWorkflowSource,
} from './snippets/ai-sdk';
import {
  chatSdkBotSource,
  chatSdkHandlersSource,
  chatSdkHookTypeSource,
  chatSdkWebhookSource,
  chatSdkWorkflowSource,
} from './snippets/chat-sdk';
import {
  resendCancelRouteSource,
  resendStartRouteSource,
  resendUsageSource,
  resendWorkflowSource,
} from './snippets/resend';
import {
  sandboxCommandRouteSource,
  sandboxStartRouteSource,
  sandboxUsageSource,
  sandboxWorkflowSource,
} from './snippets/sandbox';
import type { RegistryItem } from './types';

/**
 * Public registry of installable Workflow patterns.
 *
 * The first item is intentionally the simplest end-to-end example — Resend.
 * Add new providers below; the listing page picks them up automatically.
 */
export const registryItems: RegistryItem[] = [
  {
    id: 'resend',
    name: 'Resend',
    logo: 'resend',
    description: 'Onboarding email drip campaign.',
    longDescription:
      'A production-ready email drip campaign powered by Resend. New users get a welcome email immediately, then follow-ups spaced hours, days, or weeks apart — whatever you configure. Each send is a workflow step that gets persisted once it succeeds, so if your server restarts or crashes mid-campaign, no one ever gets a duplicate. The waits between emails cost nothing (the campaign is fully paused, not idling), so it can span days or weeks without keeping anything running. And the moment a user converts, calling a single function from your app stops the whole thing instantly — no leftover emails, no extra database tables, no flag-checking on every send.',
    tags: ['email', 'drip', 'cancellable', 'durable'],
    category: 'email',
    homepage: 'https://resend.com',
    docsUrl: 'https://resend.com/docs/send-with-nodejs',
    sourceUrl:
      'https://github.com/vercel-labs/workflow_onboarding/tree/main/nextjs_workflow/app/workflows/providers',
    shadcnSlug: '@workflow-sdk/resend',
    envVars: [
      {
        name: 'RESEND_API_KEY',
        description: 'API key from your Resend account.',
        getKeyUrl: 'https://resend.com/api-keys',
        exampleValue: 're_********',
      },
    ],
    files: [
      {
        path: 'app/workflows/providers/resendWorkflow.ts',
        description:
          'The durable email drip workflow — `emailSequence()` + `cancelNudges` hook + the three send-email steps.',
      },
      {
        path: 'app/api/providers/resend/route.ts',
        description:
          'POST endpoint that starts a new campaign and pre-cancels any in-flight run for the same email.',
      },
      {
        path: 'app/api/providers/resend/cancel/route.ts',
        description:
          'POST endpoint your app calls when the user converts — resumes the hook so the campaign exits cleanly.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'app/workflows/providers/resendWorkflow.ts',
        code: resendWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/providers/resend/route.ts',
        code: resendStartRouteSource,
      },
      {
        label: 'Cancel route',
        lang: 'tsx',
        caption: 'app/api/providers/resend/cancel/route.ts',
        code: resendCancelRouteSource,
      },
      {
        label: 'Usage',
        lang: 'tsx',
        caption: 'Trigger the campaign from your app',
        code: resendUsageSource,
      },
    ],
  },
  {
    id: 'ai-sdk',
    name: 'AI SDK',
    logo: 'ai-sdk',
    description: 'Durable multi-turn chat with streaming and tools.',
    longDescription:
      "A production-ready multi-turn chat agent powered by AI SDK's `streamText`. Each conversation is one workflow run that suspends between turns — zero compute cost while the user is reading — and resumes the moment the next message arrives. The per-turn LLM stream is durable: if your server restarts mid-response, the client reconnects with the same `runId` and picks up exactly where it left off, with the full conversation history intact. Tools are wrapped as workflow steps, so each tool call is recorded once and replayed (not re-executed) on retry. Drop in any AI Gateway model string and it works — switch from Claude to GPT to Gemini without touching the durability layer.",
    tags: ['ai', 'chat', 'streaming', 'agents', 'durable'],
    category: 'vercel',
    homepage: 'https://ai-sdk.dev',
    docsUrl: 'https://ai-sdk.dev/docs',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/integrations/ai-sdk.mdx',
    shadcnSlug: '@workflow-sdk/ai-sdk',
    envVars: [
      {
        name: 'AI_GATEWAY_API_KEY',
        description:
          'API key for Vercel AI Gateway. Lets you call any provider (Claude, GPT, Gemini, …) through one credential. Optional when running on Vercel with OIDC.',
        getKeyUrl: 'https://vercel.com/dashboard/ai-gateway',
        exampleValue: 'vck_********',
      },
    ],
    files: [
      {
        path: 'workflows/support.ts',
        description:
          'The durable chat workflow — `supportWorkflow()` + `turnHook` + tool steps. One run = one full conversation.',
      },
      {
        path: 'app/api/support/route.ts',
        description:
          'POST endpoint that handles first-turn `start()` and follow-up `turnHook.resume()`, slicing per-turn streams from the durable log.',
      },
      {
        path: 'components/support-chat.tsx',
        description:
          '`useChat()` client component wired up via `WorkflowChatTransport` — forwards `runId` between turns automatically.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/support.ts',
        code: aiSdkWorkflowSource,
      },
      {
        label: 'API route',
        lang: 'tsx',
        caption: 'app/api/support/route.ts',
        code: aiSdkRouteSource,
      },
      {
        label: 'Client',
        lang: 'tsx',
        caption: 'components/support-chat.tsx',
        code: aiSdkClientSource,
      },
    ],
  },
  {
    id: 'sandbox',
    name: 'Vercel Sandbox',
    logo: 'sandbox',
    description: 'Persistent code-execution session beyond the 5-hour cap.',
    longDescription:
      'An always-resumable code-execution session built on Vercel Sandbox. One workflow run owns one sandbox for its entire lifetime — full filesystem, network, and runtime — and the client only has to remember a single `runId`. When the user goes idle, the workflow snapshots the VM and hibernates indefinitely at zero cost; when they return, the same filesystem, installed packages, and git history are right there waiting. The pattern also rolls over the sandbox hard cap automatically: a few minutes before the 5-hour deadline it snapshots, spins up a fresh VM from that snapshot, and keeps going — so the logical session can run effectively forever on top of time-bounded infrastructure. Perfect for coding agents, AI dev environments, and any workload where users walk away and come back days later.',
    tags: ['sandbox', 'agents', 'sessions', 'durable', 'snapshots'],
    category: 'vercel',
    homepage: 'https://vercel.com/docs/sandbox',
    docsUrl: 'https://vercel.com/docs/sandbox',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/integrations/sandbox.mdx',
    shadcnSlug: '@workflow-sdk/sandbox',
    envVars: [
      {
        name: 'VERCEL_OIDC_TOKEN',
        description:
          'OIDC token used by `@vercel/sandbox` to authenticate. Set automatically when deployed to Vercel; locally, run `vercel env pull` to populate it.',
      },
    ],
    files: [
      {
        path: 'workflows/sandbox-session.ts',
        description:
          'The durable session workflow — `sandboxSessionWorkflow()` + `commandHook`, with idle hibernation and proactive sandbox refresh built in.',
      },
      {
        path: 'app/api/sandbox/start/route.ts',
        description:
          'POST endpoint that starts a new session or reconnects to an existing one, replaying the durable event log to a returning client.',
      },
      {
        path: 'app/api/sandbox/command/route.ts',
        description:
          'POST endpoint that resumes the command hook — every shell command the user runs flows through here.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/sandbox-session.ts',
        code: sandboxWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/sandbox/start/route.ts',
        code: sandboxStartRouteSource,
      },
      {
        label: 'Command route',
        lang: 'tsx',
        caption: 'app/api/sandbox/command/route.ts',
        code: sandboxCommandRouteSource,
      },
      {
        label: 'Quickstart',
        lang: 'tsx',
        caption: 'Simpler one-shot pipeline (no session loop)',
        code: sandboxUsageSource,
      },
    ],
  },
  {
    id: 'chat-sdk',
    name: 'Chat SDK',
    logo: 'chat-sdk',
    description: 'Durable bot sessions across Slack, Teams, Discord, and more.',
    longDescription:
      "A durable bot session pattern for Chat SDK. Write the bot once, deploy to Slack, Microsoft Teams, Google Chat, Discord, Telegram, GitHub, Linear, or WhatsApp — and let each conversation thread run as its own workflow. Multi-turn state lives in the durable event log instead of hand-rolled Redis bookkeeping. The bot can sleep for hours waiting on a user reply, schedule a follow-up days later, or pause on a long-running tool call — and survive every deploy and cold start in between. Inbound messages route to either a `start()` (first mention) or `resumeHook()` (every subsequent message), with the `runId` stored in Chat SDK's thread state. Outbound replies are durable steps, so platform side-effects are recorded once and replayed safely on restart.",
    tags: ['chat', 'bots', 'slack', 'teams', 'discord', 'durable'],
    category: 'vercel',
    homepage: 'https://chat-sdk.dev',
    docsUrl: 'https://chat-sdk.dev/docs/guides/durable-chat-sessions-nextjs',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/integrations/chat-sdk.mdx',
    shadcnSlug: '@workflow-sdk/chat-sdk',
    envVars: [
      {
        name: 'SLACK_BOT_TOKEN',
        description:
          'Bot token from your Slack app. Used by the Slack adapter to post replies and subscribe to thread events.',
        getKeyUrl: 'https://api.slack.com/apps',
        exampleValue: 'xoxb-********',
      },
      {
        name: 'SLACK_SIGNING_SECRET',
        description: 'Signing secret used to verify incoming Slack webhooks.',
        getKeyUrl: 'https://api.slack.com/apps',
      },
      {
        name: 'REDIS_URL',
        description:
          'Connection string for the Redis instance that backs Chat SDK thread state (`runId` per thread).',
      },
    ],
    files: [
      {
        path: 'lib/bot.ts',
        description:
          'The `Chat` singleton — adapters, state backend, and `ThreadState` type that holds the `runId` per thread.',
      },
      {
        path: 'workflows/durable-chat-session.ts',
        description:
          'The durable session workflow — `durableChatSession()` + `chatTurnHook`, with platform side-effects in dynamic-import steps.',
      },
      {
        path: 'workflows/chat-turn-hook.ts',
        description:
          'Stand-alone `ChatTurnPayload` type so the webhook handler can import it without pulling in the workflow module.',
      },
      {
        path: 'lib/chat-session-handlers.ts',
        description:
          'Event handlers — decide whether each inbound message is a `start()` or a `resumeHook()`, with stale-runId fallback.',
      },
      {
        path: 'app/api/webhooks/[platform]/route.ts',
        description:
          'Catch-all webhook route that hands every platform request to the right Chat SDK handler.',
      },
    ],
    snippets: [
      {
        label: 'Bot',
        lang: 'tsx',
        caption: 'lib/bot.ts',
        code: chatSdkBotSource,
      },
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/durable-chat-session.ts',
        code: chatSdkWorkflowSource,
      },
      {
        label: 'Hook type',
        lang: 'tsx',
        caption: 'workflows/chat-turn-hook.ts',
        code: chatSdkHookTypeSource,
      },
      {
        label: 'Handlers',
        lang: 'tsx',
        caption: 'lib/chat-session-handlers.ts',
        code: chatSdkHandlersSource,
      },
      {
        label: 'Webhook route',
        lang: 'tsx',
        caption: 'app/api/webhooks/[platform]/route.ts',
        code: chatSdkWebhookSource,
      },
    ],
  },
];

export function getRegistryItem(id: string): RegistryItem | undefined {
  return registryItems.find((item) => item.id === id);
}

export function getRegistryItemIds(): string[] {
  return registryItems.map((item) => item.id);
}

export const categoryLabels: Record<RegistryItem['category'], string> = {
  vercel: 'Vercel',
  email: 'Email',
  storage: 'Storage',
  ai: 'AI',
  auth: 'Auth',
  payments: 'Payments',
  communication: 'Communication',
  other: 'Other',
};
