import {
  agentCancellationButtonSource,
  agentCancellationRouteSource,
  agentCancellationStartRouteSource,
  agentCancellationUsageSource,
  agentCancellationWorkflowSource,
} from './snippets/agent-cancellation';
import {
  aiSdkClientSource,
  aiSdkRouteSource,
  aiSdkWorkflowSource,
} from './snippets/ai-sdk';
import {
  batchingStartRouteSource,
  batchingWorkflowSource,
} from './snippets/batching';
import {
  chatSdkBotSource,
  chatSdkHandlersSource,
  chatSdkHookTypeSource,
  chatSdkWebhookSource,
  chatSdkWorkflowSource,
} from './snippets/chat-sdk';
import {
  childWorkflowsStartRouteSource,
  childWorkflowsWorkflowSource,
} from './snippets/child-workflows';
import {
  distributedAbortControllerButtonSource,
  distributedAbortControllerLibSource,
  distributedAbortControllerRouteSource,
  distributedAbortControllerUsageSource,
} from './snippets/distributed-abort-controller';
import {
  durableAgentClientSource,
  durableAgentStartRouteSource,
  durableAgentWorkflowSource,
} from './snippets/durable-agent';
import {
  humanInTheLoopCardSource,
  humanInTheLoopRouteSource,
  humanInTheLoopStartRouteSource,
  humanInTheLoopUsageSource,
  humanInTheLoopWorkflowSource,
} from './snippets/human-in-the-loop';
import {
  idempotencyStartRouteSource,
  idempotencyWorkflowSource,
} from './snippets/idempotency';
import {
  rateLimitingStartRouteSource,
  rateLimitingWorkflowSource,
} from './snippets/rate-limiting';
import {
  resendCancelRouteSource,
  resendStartRouteSource,
  resendUsageSource,
  resendWorkflowSource,
} from './snippets/resend';
import { sagaStartRouteSource, sagaWorkflowSource } from './snippets/saga';
import {
  sandboxCommandRouteSource,
  sandboxStartRouteSource,
  sandboxUsageSource,
  sandboxWorkflowSource,
} from './snippets/sandbox';
import {
  schedulingCancelRouteSource,
  schedulingStartRouteSource,
  schedulingWorkflowSource,
} from './snippets/scheduling';
import {
  sequentialAndParallelStartRouteSource,
  sequentialAndParallelWorkflowSource,
} from './snippets/sequential-and-parallel';
import {
  timeoutsStartRouteSource,
  timeoutsWorkflowSource,
} from './snippets/timeouts';
import {
  webhooksStartRouteSource,
  webhooksWorkflowSource,
} from './snippets/webhooks';
import {
  workflowCompositionStartRouteSource,
  workflowCompositionWorkflowSource,
} from './snippets/workflow-composition';
import type { RegistryCategory, RegistryItem } from './types';

/**
 * Public registry of installable Workflow patterns.
 *
 * Items are grouped by category in the order surfaced on the listing page —
 * Agents, Vercel, Common, Advanced, Providers — and alphabetised within each
 * group. Items can belong to more than one category (e.g. AI SDK is both an
 * `agent` pattern and a `vercel` integration); they appear once here, in
 * their primary group, and the listing page surfaces them under every
 * relevant filter.
 */
export const registryItems: RegistryItem[] = [
  {
    id: 'agent-cancellation',
    name: 'Agent Cancellation',
    logo: 'agent-cancellation',
    description:
      'Cancel a running AI agent gracefully — Stop button + workflow signal + hard-cancel fallback.',
    longDescription:
      'A drop-in cancellation pattern for any `DurableAgent`, covering both graceful Stop Signal and Hard Cancellation. The workflow races the agent against a `stopHook` keyed by the run ID; clicking Stop posts to a route that resumes the hook, the workflow exits at its next `await` boundary, and a `data-stopped` part is streamed to the client so it renders a clean ending instead of an abrupt connection close. The route automatically falls back to `getRun(runId).cancel()` if the hook is already gone (e.g. the agent finished mid-request), so the Stop button always succeeds. Note: the Stop Signal does not cancel the underlying model stream — tokens generated after the stop signal are still produced and billed; what it does is exit the workflow function and notify the client.',
    tags: ['agent', 'cancellation', 'stop-button', 'durable'],
    categories: ['agent'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl:
      'https://workflow-sdk.dev/cookbook/agent-patterns/agent-cancellation',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/agent-patterns/agent-cancellation.mdx',
    shadcnSlug: '@workflow-sdk/agent-cancellation',
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
        path: 'workflows/stoppable-agent.ts',
        description:
          'Durable agent + `stopHook` + `Promise.race` exit, with a final `data-stopped` part emitted on stop.',
      },
      {
        path: 'app/api/agent/route.ts',
        description:
          'POST endpoint that starts the agent and returns the streaming response with `x-workflow-run-id` set.',
      },
      {
        path: 'app/api/agent/[runId]/stop/route.ts',
        description:
          'POST endpoint that resumes `stopHook` for the given `runId` with a `getRun(runId).cancel()` fallback when the hook is already gone.',
      },
      {
        path: 'components/stop-button.tsx',
        description:
          'Reusable client component — takes a `runId`, posts to the stop route, and disables itself while the request is in flight.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/stoppable-agent.ts',
        code: agentCancellationWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/agent/route.ts',
        code: agentCancellationStartRouteSource,
      },
      {
        label: 'Stop route',
        lang: 'tsx',
        caption: 'app/api/agent/[runId]/stop/route.ts',
        code: agentCancellationRouteSource,
      },
      {
        label: 'Button',
        lang: 'tsx',
        caption: 'components/stop-button.tsx',
        code: agentCancellationButtonSource,
      },
      {
        label: 'Usage',
        lang: 'tsx',
        caption: 'Wire the Stop button into your chat UI',
        code: agentCancellationUsageSource,
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
    categories: ['agent', 'vercel'],
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
    id: 'durable-agent',
    name: 'Durable Agent',
    logo: 'durable-agent',
    description:
      'Replace a stateless AI agent with a durable one — tools as steps, streamed output, crash-safe by default.',
    longDescription:
      'The foundational AI agent pattern on Workflow. Wrap any AI SDK agent in `DurableAgent`, mark each tool with `"use step"`, and stream output through `getWritable<UIMessageChunk>()`. The framework handles retries, replay, and persistence automatically — if the process crashes mid-tool-call, the agent resumes from the last completed step on replay, with no extra bookkeeping in your code. Each tool call gets automatic retries (3× by default), an entry in the workflow event log for observability, and full Node.js access. Drop in any AI Gateway model string and switch providers without touching the durability layer. The included example is a flight booking agent (search → book → weather check) — replace the tools with your own; the surrounding shape stays identical.',
    tags: ['agents', 'ai', 'durable', 'tools', 'streaming'],
    categories: ['agent'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl: 'https://workflow-sdk.dev/cookbook/agent-patterns/durable-agent',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/agent-patterns/durable-agent.mdx',
    shadcnSlug: '@workflow-sdk/durable-agent',
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
        path: 'workflows/flight-agent.ts',
        description:
          'The durable agent workflow — `flightAgent()` orchestrator + three tool steps (`searchFlights`, `bookFlight`, `checkWeather`). Replace the tools with your own.',
      },
      {
        path: 'app/api/flight-agent/route.ts',
        description:
          'POST endpoint that converts incoming `UIMessage`s, starts the agent with `start()`, and returns the streaming response with `x-workflow-run-id` set.',
      },
      {
        path: 'components/flight-agent-chat.tsx',
        description:
          '`useChat()` client component wired up via `WorkflowChatTransport` — forwards the run ID between turns automatically for durable multi-turn conversations.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/flight-agent.ts',
        code: durableAgentWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/flight-agent/route.ts',
        code: durableAgentStartRouteSource,
      },
      {
        label: 'Client',
        lang: 'tsx',
        caption: 'components/flight-agent-chat.tsx',
        code: durableAgentClientSource,
      },
    ],
  },
  {
    id: 'human-in-the-loop',
    name: 'Human In The Loop',
    logo: 'human-in-the-loop',
    description:
      'Pause an AI agent to wait for human approval, then resume with the decision.',
    longDescription:
      'A drop-in human-in-the-loop pattern for any `DurableAgent`. The agent calls an approval tool before any consequential action; the tool emits a custom data part to the stream so the client can render Approve / Reject controls, then suspends on a `defineHook()` keyed by the tool call ID. An approval API route resumes the hook with the decision, the workflow streams the resolution, and the agent continues. A 24-hour `sleep()` races the hook so stale requests expire automatically. Comes with a generic approval card component that renders any payload schema and listens for `data-approval-needed` / `data-approval-resolved` parts.',
    tags: ['agent', 'approval', 'human-in-the-loop', 'durable'],
    categories: ['agent'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl:
      'https://workflow-sdk.dev/cookbook/agent-patterns/human-in-the-loop',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/agent-patterns/human-in-the-loop.mdx',
    shadcnSlug: '@workflow-sdk/human-in-the-loop',
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
        path: 'workflows/approval-agent.ts',
        description:
          'Durable agent + `approvalHook` + the `requestApproval` tool that races the hook against a 24h `sleep()` and streams resolution parts.',
      },
      {
        path: 'app/api/approval-agent/route.ts',
        description:
          'POST endpoint that starts the agent and returns the streaming response with `x-workflow-run-id` set.',
      },
      {
        path: 'app/api/approval/route.ts',
        description:
          'POST endpoint that resumes `approvalHook` with `{ approved, comment }`. Idempotent against expired/already-consumed hooks.',
      },
      {
        path: 'components/approval-card.tsx',
        description:
          'Reusable client component — renders the payload, posts the decision, and swaps to the resolution once it streams in.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/approval-agent.ts',
        code: humanInTheLoopWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/approval-agent/route.ts',
        code: humanInTheLoopStartRouteSource,
      },
      {
        label: 'Approval route',
        lang: 'tsx',
        caption: 'app/api/approval/route.ts',
        code: humanInTheLoopRouteSource,
      },
      {
        label: 'Card',
        lang: 'tsx',
        caption: 'components/approval-card.tsx',
        code: humanInTheLoopCardSource,
      },
      {
        label: 'Usage',
        lang: 'tsx',
        caption: 'Wire the card into your chat UI',
        code: humanInTheLoopUsageSource,
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
    categories: ['vercel', 'agent'],
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
  {
    id: 'sandbox',
    name: 'Vercel Sandbox',
    logo: 'sandbox',
    description: 'Persistent code-execution session beyond the 5-hour cap.',
    longDescription:
      'An always-resumable code-execution session built on Vercel Sandbox. One workflow run owns one sandbox for its entire lifetime — full filesystem, network, and runtime — and the client only has to remember a single `runId`. When the user goes idle, the workflow snapshots the VM and hibernates indefinitely at zero cost; when they return, the same filesystem, installed packages, and git history are right there waiting. The pattern also rolls over the sandbox hard cap automatically: a few minutes before the 5-hour deadline it snapshots, spins up a fresh VM from that snapshot, and keeps going — so the logical session can run effectively forever on top of time-bounded infrastructure. Perfect for coding agents, AI dev environments, and any workload where users walk away and come back days later.',
    tags: ['sandbox', 'agents', 'sessions', 'durable', 'snapshots'],
    categories: ['vercel', 'agent'],
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
    id: 'batching',
    name: 'Batching',
    logo: 'batching',
    description:
      'Process large collections in parallel batches with failure isolation between groups.',
    longDescription:
      'Bulk-process arbitrary records by splitting them into fixed-size batches, running each batch concurrently with `Promise.allSettled` (failures inside a batch are isolated per record), and pacing batches with `sleep()` to respect downstream rate limits. Each record runs as its own step → durable, automatically retried up to 3×, and replayable. The workflow returns a tally with per-record failure reasons. Ships a generic `ImportRecord` shape — replace it with your own and customise the step.',
    tags: ['batching', 'fan-out', 'parallel', 'bulk-import'],
    categories: ['common'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl: 'https://workflow-sdk.dev/cookbook/common-patterns/batching',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/common-patterns/batching.mdx',
    shadcnSlug: '@workflow-sdk/batching',
    files: [
      {
        path: 'workflows/batching.ts',
        description:
          'Generic `batchImport()` — chunks records, runs each batch with Promise.allSettled, paces with sleep(), returns a tally + failure list.',
      },
      {
        path: 'app/api/batching/route.ts',
        description: 'POST endpoint that starts the batch import workflow.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/batching.ts',
        code: batchingWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/batching/route.ts',
        code: batchingStartRouteSource,
      },
    ],
  },
  {
    id: 'idempotency',
    name: 'Idempotency',
    logo: 'idempotency',
    description:
      "Pass each step's deterministic stepId as the Idempotency-Key so retries never duplicate side effects.",
    longDescription:
      'Workflow steps can be retried (on failure) and replayed (on cold start). Without an idempotency key, that means duplicate Stripe charges, duplicate emails, duplicate records. `getStepMetadata().stepId` returns a deterministic ID that is stable across retries and replays of the same step — pass it as the `Idempotency-Key` header to any external API that supports the convention. Ships a Stripe-shaped charge + receipt example; the same shape works for any provider.',
    tags: ['idempotency', 'stripe', 'retries', 'exactly-once'],
    categories: ['common'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl: 'https://workflow-sdk.dev/cookbook/common-patterns/idempotency',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/common-patterns/idempotency.mdx',
    shadcnSlug: '@workflow-sdk/idempotency',
    envVars: [
      {
        name: 'STRIPE_SECRET_KEY',
        description:
          'Server-side Stripe secret key. Used by the example charge step — swap for any provider that supports idempotency keys.',
        getKeyUrl: 'https://dashboard.stripe.com/apikeys',
        exampleValue: 'sk_live_********',
      },
    ],
    files: [
      {
        path: 'workflows/idempotency.ts',
        description:
          '`chargeCustomer()` workflow — Stripe charge + receipt, both keyed by their step IDs so retries dedupe automatically.',
      },
      {
        path: 'app/api/idempotency/route.ts',
        description: 'POST endpoint that starts the charge workflow.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/idempotency.ts',
        code: idempotencyWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/idempotency/route.ts',
        code: idempotencyStartRouteSource,
      },
    ],
  },
  {
    id: 'rate-limiting',
    name: 'Rate Limiting',
    logo: 'rate-limiting',
    description:
      'Handle 429 responses and transient failures with RetryableError + automatic backoff.',
    longDescription:
      "Stop writing manual sleep-retry loops. Throw `RetryableError` with a `retryAfter` value (millis, duration string, or `Date`) and the workflow runtime reschedules the step natively — more efficient than wall-clock sleeps and survives cold starts. Ships two flavors: Retry-After (read the header, pass it through) and exponential backoff (use `getStepMetadata().attempt` for `1s, 4s, 9s…`). `FatalError` short-circuits retries when retrying won't help.",
    tags: ['rate-limit', 'retry', 'backoff', '429'],
    categories: ['common'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl: 'https://workflow-sdk.dev/cookbook/common-patterns/rate-limiting',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/common-patterns/rate-limiting.mdx',
    shadcnSlug: '@workflow-sdk/rate-limiting',
    files: [
      {
        path: 'workflows/rate-limiting.ts',
        description:
          '`syncContact()` — Retry-After header on 429, exponential backoff on 5xx, `maxRetries = 10` override for known-flaky endpoints.',
      },
      {
        path: 'app/api/rate-limiting/route.ts',
        description: 'POST endpoint that starts the rate-limited sync.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/rate-limiting.ts',
        code: rateLimitingWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/rate-limiting/route.ts',
        code: rateLimitingStartRouteSource,
      },
    ],
  },
  {
    id: 'saga',
    name: 'Saga',
    logo: 'saga',
    description:
      'Multi-step business transactions with automatic rollback on failure.',
    longDescription:
      'Coordinate transactions that span multiple services with automatic compensation. Each forward step does its work and pushes an undo onto a stack; if a later step throws `FatalError`, the catch block unwinds compensations in LIFO order to restore consistency. Compensations are themselves steps — durable, retried, and idempotent. Ships a complete "reserve seats → capture invoice → provision → notify" example shaped for replacement with your real APIs.',
    tags: ['saga', 'transactions', 'rollback', 'compensation'],
    categories: ['common'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl: 'https://workflow-sdk.dev/cookbook/common-patterns/saga',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/common-patterns/saga.mdx',
    shadcnSlug: '@workflow-sdk/saga',
    files: [
      {
        path: 'workflows/saga.ts',
        description:
          'Subscription-upgrade saga — three forward steps, three matching idempotent compensations, LIFO unwind on FatalError.',
      },
      {
        path: 'app/api/saga/route.ts',
        description: 'POST endpoint that starts the saga workflow.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/saga.ts',
        code: sagaWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/saga/route.ts',
        code: sagaStartRouteSource,
      },
    ],
  },
  {
    id: 'scheduling',
    name: 'Scheduling',
    logo: 'scheduling',
    description:
      'Schedule any future action with durable sleep and a cancel hook — no DB flags required.',
    longDescription:
      'Drop-in pattern for scheduled actions that need to be cancellable. The workflow races a durable `sleep()` against a `defineHook()` keyed by a stable token (you choose — e.g. `schedule:<id>`). Whichever resolves first wins: timer fires → run the action; hook resolves → cancel cleanly. Costs nothing while sleeping, and survives restarts/deployments. Generic action shape — swap the `runAction` step for emails, push notifications, Slack messages, webhooks, anything.',
    tags: ['scheduling', 'reminders', 'cancellable', 'sleep'],
    categories: ['common'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl: 'https://workflow-sdk.dev/cookbook/common-patterns/scheduling',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/common-patterns/scheduling.mdx',
    shadcnSlug: '@workflow-sdk/scheduling',
    files: [
      {
        path: 'workflows/scheduling.ts',
        description:
          '`scheduleAction()` workflow + exported `cancelSchedule` hook + `runAction` step you customise per use case.',
      },
      {
        path: 'app/api/scheduling/route.ts',
        description: 'POST endpoint that schedules a new action.',
      },
      {
        path: 'app/api/scheduling/cancel/route.ts',
        description:
          'POST endpoint that cancels an in-flight schedule by token. Idempotent — safe to call when the schedule has already fired.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/scheduling.ts',
        code: schedulingWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/scheduling/route.ts',
        code: schedulingStartRouteSource,
      },
      {
        label: 'Cancel route',
        lang: 'tsx',
        caption: 'app/api/scheduling/cancel/route.ts',
        code: schedulingCancelRouteSource,
      },
    ],
  },
  {
    id: 'sequential-and-parallel',
    name: 'Sequential & Parallel',
    logo: 'sequential-and-parallel',
    description:
      'Compose steps with await, Promise.all, and Promise.race against durable sleeps and webhooks.',
    longDescription:
      'Workflows are plain async functions, so the standard composition primitives apply unchanged — sequential `await` for pipelines, `Promise.all` for fan-out, `Promise.race` for first-finisher logic. Because `sleep()` and `createWebhook()` are also promises, racing real work against a durable deadline is a one-liner. Ships a single workflow file with three illustrative entry points (pipeline / fan-out / race-with-sleep) and a start route — replace the placeholder steps with your real logic.',
    tags: ['composition', 'parallel', 'race', 'pipeline'],
    categories: ['common'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl:
      'https://workflow-sdk.dev/cookbook/common-patterns/sequential-and-parallel',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/common-patterns/sequential-and-parallel.mdx',
    shadcnSlug: '@workflow-sdk/sequential-and-parallel',
    files: [
      {
        path: 'workflows/sequential-and-parallel.ts',
        description:
          'Three entry points — pipeline, fan-out, race — over a small set of placeholder steps you replace with real work.',
      },
      {
        path: 'app/api/sequential-and-parallel/route.ts',
        description: 'POST endpoint that starts the fan-out workflow.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/sequential-and-parallel.ts',
        code: sequentialAndParallelWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/sequential-and-parallel/route.ts',
        code: sequentialAndParallelStartRouteSource,
      },
    ],
  },
  {
    id: 'timeouts',
    name: 'Timeouts',
    logo: 'timeouts',
    description:
      'Add deadlines to slow steps, hooks, and webhooks by racing them against durable sleep.',
    longDescription:
      'Bound how long any work can take. `Promise.race([work, sleep("30s")])` returns whichever resolves first; tag the sleep branch with a sentinel value so TypeScript narrows the result. Ships hard-timeout (throw on deadline), soft-timeout (fall back to a cached value), and the webhook + 7-day deadline shape for human approvals. Note: the loser keeps running with side effects intact — see Distributed Abort Controller for hard cross-process cancellation.',
    tags: ['timeout', 'deadline', 'race', 'sleep'],
    categories: ['common'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl: 'https://workflow-sdk.dev/cookbook/common-patterns/timeouts',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/common-patterns/timeouts.mdx',
    shadcnSlug: '@workflow-sdk/timeouts',
    files: [
      {
        path: 'workflows/timeouts.ts',
        description:
          'Three entry points — hard timeout, soft timeout with fallback, and a webhook racing a 7-day deadline.',
      },
      {
        path: 'app/api/timeouts/route.ts',
        description: 'POST endpoint that starts the hard-timeout workflow.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/timeouts.ts',
        code: timeoutsWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/timeouts/route.ts',
        code: timeoutsStartRouteSource,
      },
    ],
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    logo: 'webhooks',
    description:
      'Receive HTTP callbacks from external services, process them durably, and respond inline.',
    longDescription:
      'Drop-in webhook receiver pattern. `createWebhook()` returns a URL the workflow can `for await` over; each incoming request is processed in its own step with full Node.js access, and `request.respondWith()` lets the step shape the HTTP response inline. Ships two flavors: a long-running listener (Stripe-style multi-event ledger that exits on a terminal event), and async-request-reply (submit to a vendor with our webhook URL, race the callback against a 30-second deadline).',
    tags: ['webhook', 'callback', 'integration', 'external-api'],
    categories: ['common'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl: 'https://workflow-sdk.dev/cookbook/common-patterns/webhooks',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/common-patterns/webhooks.mdx',
    shadcnSlug: '@workflow-sdk/webhooks',
    files: [
      {
        path: 'workflows/webhooks.ts',
        description:
          'Two patterns — `paymentWebhook()` (long-running event ledger) and `asyncVerification()` (request-reply with deadline).',
      },
      {
        path: 'app/api/webhooks/route.ts',
        description:
          'POST endpoint that starts the payment webhook. The auto-generated webhook URL is exposed via `webhook.url` in the workflow return value.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/webhooks.ts',
        code: webhooksWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/webhooks/route.ts',
        code: webhooksStartRouteSource,
      },
    ],
  },
  {
    id: 'workflow-composition',
    name: 'Workflow Composition',
    logo: 'workflow-composition',
    description:
      'Call workflows from workflows — direct await for inline composition, start() for independent runs.',
    longDescription:
      'Two ways to compose workflows. Direct `await` of a child workflow flattens its steps into the parent\'s event log — one runId, one retry boundary, one timeline. `start()` from inside a step spawns the child as an independent run with its own runId, separate event log, and its own retry boundary — ideal for fire-and-forget, fan-out, and self-upgrading workflows (`deploymentId: "latest"`). Ships parent + child workflows + a spawn step + a start route.',
    tags: ['composition', 'child-workflow', 'spawn', 'start'],
    categories: ['common'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl:
      'https://workflow-sdk.dev/cookbook/common-patterns/workflow-composition',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/common-patterns/workflow-composition.mdx',
    shadcnSlug: '@workflow-sdk/workflow-composition',
    files: [
      {
        path: 'workflows/workflow-composition.ts',
        description:
          'Parent + child workflows demonstrating both direct-await flattening and background spawn via `start()` from a step.',
      },
      {
        path: 'app/api/workflow-composition/route.ts',
        description: 'POST endpoint that starts the parent workflow.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/workflow-composition.ts',
        code: workflowCompositionWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/workflow-composition/route.ts',
        code: workflowCompositionStartRouteSource,
      },
    ],
  },
  {
    id: 'child-workflows',
    name: 'Child Workflows',
    logo: 'child-workflows',
    description:
      'Spawn many independent child workflows from a parent and orchestrate them with spawn-and-poll.',
    longDescription:
      'Use child workflows when one workflow needs to orchestrate many independent units of work. Each child runs as its own workflow with a separate event log, retry boundary, and failure scope — a failing child never aborts unrelated work, and you get per-item observability via each child\'s runId. Ships the full parent + child + chunked spawn step + durable polling loop + result-collection step. Pre-wired with `deploymentId: "latest"` so children pick up future deployments.',
    tags: ['fan-out', 'spawn', 'poll', 'orchestration'],
    categories: ['advanced'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl: 'https://workflow-sdk.dev/cookbook/advanced/child-workflows',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/advanced/child-workflows.mdx',
    shadcnSlug: '@workflow-sdk/child-workflows',
    files: [
      {
        path: 'workflows/child-workflows.ts',
        description:
          '`processDocumentBatch()` parent + `processDocument()` child + chunked spawn step + durable polling loop + result-collection step.',
      },
      {
        path: 'app/api/child-workflows/route.ts',
        description:
          'POST endpoint that starts the parent workflow with a list of document IDs.',
      },
    ],
    snippets: [
      {
        label: 'Workflow',
        lang: 'tsx',
        caption: 'workflows/child-workflows.ts',
        code: childWorkflowsWorkflowSource,
      },
      {
        label: 'Start route',
        lang: 'tsx',
        caption: 'app/api/child-workflows/route.ts',
        code: childWorkflowsStartRouteSource,
      },
    ],
  },
  {
    id: 'distributed-abort-controller',
    name: 'Distributed Abort Controller',
    logo: 'distributed-abort-controller',
    description:
      'AbortController-shaped API for cross-process cancellation, backed by a durable workflow.',
    longDescription:
      "A drop-in replacement for `AbortController` that works across process boundaries. Calling `.abort()` on one machine fires the `.signal` `AbortSignal` on any other machine that created a controller with the same semantic ID — no run ID sharing required. Backed by a coordination workflow that races a manual abort hook against a TTL sleep; when triggered, it writes to the run's stream and any subscriber's `AbortSignal` flips. Includes `Create`-is-idempotent reconnection (find an existing run by hook token), TTL auto-cleanup, and an optional grace period for late subscribers. Ships the lib module, a remote-abort route, and a client cancel button.",
    tags: ['abort', 'cancellation', 'distributed', 'cross-process'],
    categories: ['advanced'],
    homepage: 'https://workflow-sdk.dev',
    docsUrl:
      'https://workflow-sdk.dev/cookbook/advanced/distributed-abort-controller',
    sourceUrl:
      'https://github.com/vercel/workflow/tree/main/docs/content/docs/cookbook/advanced/distributed-abort-controller.mdx',
    shadcnSlug: '@workflow-sdk/distributed-abort-controller',
    files: [
      {
        path: 'lib/distributed-abort-controller.ts',
        description:
          'Coordination workflow + `DistributedAbortController` class with `.abort()` and `.signal` (an `AbortSignal`).',
      },
      {
        path: 'app/api/abort/[id]/route.ts',
        description:
          'POST endpoint that triggers the abort signal for a given semantic ID. Idempotent.',
      },
      {
        path: 'components/cancel-button.tsx',
        description:
          'Client component — calls the abort route on click and reflects the cancellation state in the UI.',
      },
    ],
    snippets: [
      {
        label: 'Lib',
        lang: 'tsx',
        caption: 'lib/distributed-abort-controller.ts',
        code: distributedAbortControllerLibSource,
      },
      {
        label: 'Abort route',
        lang: 'tsx',
        caption: 'app/api/abort/[id]/route.ts',
        code: distributedAbortControllerRouteSource,
      },
      {
        label: 'Cancel button',
        lang: 'tsx',
        caption: 'components/cancel-button.tsx',
        code: distributedAbortControllerButtonSource,
      },
      {
        label: 'Usage',
        lang: 'tsx',
        caption: 'Pass `controller.signal` to any AbortSignal-aware API',
        code: distributedAbortControllerUsageSource,
      },
    ],
  },
  {
    id: 'resend',
    name: 'Resend',
    logo: 'resend',
    description: 'Onboarding email drip campaign.',
    longDescription:
      'A production-ready email drip campaign powered by Resend. New users get a welcome email immediately, then follow-ups spaced hours, days, or weeks apart — whatever you configure. Each send is a workflow step that gets persisted once it succeeds, so if your server restarts or crashes mid-campaign, no one ever gets a duplicate. The waits between emails cost nothing (the campaign is fully paused, not idling), so it can span days or weeks without keeping anything running. And the moment a user converts, calling a single function from your app stops the whole thing instantly — no leftover emails, no extra database tables, no flag-checking on every send.',
    tags: ['email', 'drip', 'cancellable', 'durable'],
    categories: ['provider'],
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
];

export function getRegistryItem(id: string): RegistryItem | undefined {
  return registryItems.find((item) => item.id === id);
}

export function getRegistryItemIds(): string[] {
  return registryItems.map((item) => item.id);
}

export const categoryLabels: Record<RegistryCategory, string> = {
  agent: 'Agents',
  vercel: 'Vercel',
  common: 'Common',
  advanced: 'Advanced',
  provider: 'Providers',
  storage: 'Storage',
  ai: 'AI',
  auth: 'Auth',
  payments: 'Payments',
  communication: 'Communication',
  other: 'Other',
};
