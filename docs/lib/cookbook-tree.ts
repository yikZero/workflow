export type Branch = {
  label: string;
  icon: string;
  slugs?: string[];
  next?: TreeNode;
};

export type TreeNode = {
  id: string;
  question: string;
  branches: Branch[];
};

export type Recipe = {
  slug: string;
  title: string;
  description: string;
  whenToUse: string;
  category: string;
};

export type RecipeCategory =
  | 'payments'
  | 'approvals'
  | 'resilience'
  | 'notifications'
  | 'webhooks'
  | 'data-processing'
  | 'routing'
  | 'observability';

export const categoryOrder: RecipeCategory[] = [
  'payments',
  'approvals',
  'resilience',
  'notifications',
  'webhooks',
  'data-processing',
  'routing',
  'observability',
];

export const categoryLabels: Record<RecipeCategory, string> = {
  payments: 'Payments & Orders',
  approvals: 'Approvals',
  resilience: 'Resilience',
  notifications: 'Notifications',
  webhooks: 'Webhooks & Callbacks',
  'data-processing': 'Data Processing',
  routing: 'Routing',
  observability: 'Observability',
};

/** Map from slug → category folder for URL construction */
export const slugToCategory: Record<string, string> = {
  saga: 'payments',
  choreography: 'payments',
  'process-manager': 'payments',
  'guaranteed-delivery': 'payments',
  'transactional-outbox': 'payments',
  'idempotent-receiver': 'payments',

  'approval-gate': 'approvals',
  'cancellable-export': 'approvals',
  'approval-chain': 'approvals',
  'scheduler-agent-supervisor': 'approvals',

  'retry-backoff': 'resilience',
  'retryable-rate-limit': 'resilience',
  throttle: 'resilience',
  'circuit-breaker': 'resilience',
  bulkhead: 'resilience',
  'hedge-request': 'resilience',
  'dead-letter-queue': 'resilience',

  'fan-out': 'notifications',
  'publish-subscribe': 'notifications',
  'recipient-list': 'notifications',
  'onboarding-drip': 'notifications',
  'wakeable-reminder': 'notifications',
  'scheduled-digest': 'notifications',

  'async-request-reply': 'webhooks',
  'request-reply': 'webhooks',
  'webhook-basics': 'webhooks',
  'claim-check': 'webhooks',
  'event-gateway': 'webhooks',
  'status-poller': 'webhooks',

  pipeline: 'data-processing',
  'batch-processor': 'data-processing',
  'map-reduce': 'data-processing',
  'scatter-gather': 'data-processing',
  aggregator: 'data-processing',
  splitter: 'data-processing',
  resequencer: 'data-processing',
  'competing-consumers': 'data-processing',
  'priority-queue': 'data-processing',

  'content-based-router': 'routing',
  detour: 'routing',
  'routing-slip': 'routing',
  'message-translator': 'routing',
  normalizer: 'routing',
  'content-enricher': 'routing',
  'message-filter': 'routing',

  'wire-tap': 'observability',
  'message-history': 'observability',
  'correlation-identifier': 'observability',
  'event-sourcing': 'observability',
  'namespaced-streams': 'observability',
};

/** All recipe metadata, keyed by slug */
export const recipes: Record<string, Recipe> = {
  saga: {
    slug: 'saga',
    title: 'Saga',
    description:
      'Long-lived transaction across services using forward steps and compensations.',
    whenToUse:
      'Upgrade a subscription (reserve seats, capture invoice, provision) with auto-rollback on failure.',
    category: 'payments',
  },
  choreography: {
    slug: 'choreography',
    title: 'Choreography',
    description:
      'Peers react to events independently \u2014 no central orchestrator.',
    whenToUse:
      'Order flow where inventory, payment, and shipping react to events with automatic compensation on failure.',
    category: 'payments',
  },
  'process-manager': {
    slug: 'process-manager',
    title: 'Process Manager',
    description:
      'Track a multi-step business process and react to events until it completes.',
    whenToUse:
      'Orchestrate payment, inventory, backorder, shipping, and delivery with branching logic.',
    category: 'payments',
  },
  'guaranteed-delivery': {
    slug: 'guaranteed-delivery',
    title: 'Guaranteed Delivery',
    description:
      'Persist-and-retry semantics so work is not lost across crashes or restarts.',
    whenToUse:
      'Ensure a payment confirmation is delivered even if the server restarts mid-send.',
    category: 'payments',
  },
  'transactional-outbox': {
    slug: 'transactional-outbox',
    title: 'Transactional Outbox',
    description:
      'Write business data and an outbox event in one transaction, then publish reliably.',
    whenToUse:
      'Persist an order and relay it to a message broker in one transaction for at-least-once delivery.',
    category: 'payments',
  },
  'idempotent-receiver': {
    slug: 'idempotent-receiver',
    title: 'Idempotent Receiver',
    description:
      'Handle duplicate deliveries safely (same logical operation, same outcome).',
    whenToUse:
      'Detect duplicate payment webhooks with an idempotency key and return the cached result.',
    category: 'payments',
  },
  'approval-gate': {
    slug: 'approval-gate',
    title: 'Approval Gate',
    description:
      'Pause the workflow until a human approves or rejects, then resume or fail.',
    whenToUse:
      'Content moderation hold: pause publishing until a reviewer clicks approve or reject.',
    category: 'approvals',
  },
  'cancellable-export': {
    slug: 'cancellable-export',
    title: 'Cancellable Export',
    description:
      'Long-running job that the user can cancel while steps are in flight.',
    whenToUse:
      'User starts a 100k-row data export and hits Cancel mid-flight without waiting for completion.',
    category: 'approvals',
  },
  'approval-chain': {
    slug: 'approval-chain',
    title: 'Approval Chain',
    description:
      'Route work through a sequence of approvers; advance only when each step signs off.',
    whenToUse:
      'Purchase orders needing manager, director, VP sign-off with per-level escalation timeouts.',
    category: 'approvals',
  },
  'scheduler-agent-supervisor': {
    slug: 'scheduler-agent-supervisor',
    title: 'Scheduler-Agent-Supervisor',
    description:
      'Scheduled triggers plus supervised agent/worker style execution.',
    whenToUse:
      'Dispatch content generation to agents in sequence, checking quality thresholds with escalation.',
    category: 'approvals',
  },
  'retry-backoff': {
    slug: 'retry-backoff',
    title: 'Retry with Backoff',
    description:
      'Retry failed steps with increasing delay to avoid hammering flaky dependencies.',
    whenToUse:
      'Retry a flaky email API with 1s, 2s, 4s backoff instead of failing on the first hiccup.',
    category: 'resilience',
  },
  'retryable-rate-limit': {
    slug: 'retryable-rate-limit',
    title: 'Retryable Rate Limit',
    description:
      'On 429 / rate limits, back off and retry instead of failing immediately.',
    whenToUse:
      'Sync contacts to an external CRM and auto-retry when the API returns 429 with retry-after.',
    category: 'resilience',
  },
  throttle: {
    slug: 'throttle',
    title: 'Throttle',
    description:
      'Limit how often work runs or how many concurrent operations are allowed.',
    whenToUse:
      'Cap outbound API calls to 10/second so you do not blow your third-party rate limit.',
    category: 'resilience',
  },
  'circuit-breaker': {
    slug: 'circuit-breaker',
    title: 'Circuit Breaker',
    description:
      'Stop calling a failing dependency for a cooldown, then probe for recovery.',
    whenToUse:
      'Stop hammering a down payment gateway after 3 failures, wait 30s, then test with one probe request.',
    category: 'resilience',
  },
  bulkhead: {
    slug: 'bulkhead',
    title: 'Bulkhead',
    description:
      'Isolate capacity or failure domains so one overloaded path does not sink the whole system.',
    whenToUse:
      'Partition order items into isolated groups so one bad SKU does not block the rest of the shipment.',
    category: 'resilience',
  },
  'hedge-request': {
    slug: 'hedge-request',
    title: 'Hedge Request',
    description:
      'Send duplicate requests; take the first successful response to cut tail latency.',
    whenToUse:
      'Fire the same search query to two replicas and use whichever responds first.',
    category: 'resilience',
  },
  'dead-letter-queue': {
    slug: 'dead-letter-queue',
    title: 'Dead Letter Queue',
    description:
      'After repeated failure, move a message aside for inspection instead of infinite retry.',
    whenToUse:
      'Route undeliverable messages to a dead-letter queue after 3 retries for ops review.',
    category: 'resilience',
  },
  'fan-out': {
    slug: 'fan-out',
    title: 'Fan-Out',
    description:
      'One trigger fans out to parallel branches (often paired with gather/aggregate).',
    whenToUse:
      'Broadcast an incident alert to Slack, email, SMS, and PagerDuty in parallel.',
    category: 'notifications',
  },
  'publish-subscribe': {
    slug: 'publish-subscribe',
    title: 'Publish-Subscribe',
    description:
      'One publisher, many subscribers \u2014 broadcast-style distribution.',
    whenToUse:
      'A product-update event triggers email, push notification, and analytics subscribers independently.',
    category: 'notifications',
  },
  'recipient-list': {
    slug: 'recipient-list',
    title: 'Recipient List',
    description:
      'Same logical message delivered to a list of recipients (static or dynamic).',
    whenToUse:
      'Evaluate severity rules at runtime and alert matching channels (Slack, email, PagerDuty).',
    category: 'notifications',
  },
  'onboarding-drip': {
    slug: 'onboarding-drip',
    title: 'Onboarding Drip',
    description:
      'Time-delayed sequence (e.g. emails or nudges) with durable waits between steps.',
    whenToUse:
      'Send a welcome email on signup, a tips email after 2 days, and a check-in after a week.',
    category: 'notifications',
  },
  'wakeable-reminder': {
    slug: 'wakeable-reminder',
    title: 'Wakeable Reminder',
    description:
      'Sleep until a deadline or wake early when an external event arrives.',
    whenToUse:
      'Schedule a payment reminder for 3 days out, but let the user cancel, snooze, or pay early via webhook.',
    category: 'notifications',
  },
  'scheduled-digest': {
    slug: 'scheduled-digest',
    title: 'Scheduled Digest',
    description:
      'Accumulate activity and emit a summary on a schedule (e.g. daily digest).',
    whenToUse:
      'Open a 1-hour collection window for events, then email a digest when the window closes.',
    category: 'notifications',
  },
  'async-request-reply': {
    slug: 'async-request-reply',
    title: 'Async Request-Reply',
    description:
      'Start work, wait off-thread, and continue when an async callback or signal arrives.',
    whenToUse:
      'Submit a request to a vendor API and resume when the webhook callback arrives.',
    category: 'webhooks',
  },
  'request-reply': {
    slug: 'request-reply',
    title: 'Request-Reply',
    description:
      'Call/response style interaction modeled inside a durable workflow.',
    whenToUse:
      'Send a request to a service, wait for a correlated reply with a deadline, and retry on timeout.',
    category: 'webhooks',
  },
  'webhook-basics': {
    slug: 'webhook-basics',
    title: 'Webhook Basics',
    description:
      'Ingest HTTP webhooks, validate, and drive workflow steps from external systems.',
    whenToUse:
      'Accept Stripe or GitHub webhooks, validate signatures, and kick off internal workflow steps.',
    category: 'webhooks',
  },
  'claim-check': {
    slug: 'claim-check',
    title: 'Claim Check',
    description:
      'Pass a small reference through the workflow; store or fetch the heavy payload elsewhere.',
    whenToUse:
      'Accept a lightweight token instead of passing a 50 MB file through every workflow step.',
    category: 'webhooks',
  },
  'event-gateway': {
    slug: 'event-gateway',
    title: 'Event Gateway',
    description:
      'Normalize many external event shapes into one internal representation.',
    whenToUse:
      'Wait for payment, inventory, and fraud-check signals to all arrive before shipping an order.',
    category: 'webhooks',
  },
  'status-poller': {
    slug: 'status-poller',
    title: 'Status Poller',
    description:
      'Poll an external API or job until it reaches a terminal state, with backoff.',
    whenToUse:
      'Poll a video transcoding job until it is ready, sleeping between checks with a max-poll safety valve.',
    category: 'webhooks',
  },
  pipeline: {
    slug: 'pipeline',
    title: 'Pipeline',
    description:
      'Linear chain of stages \u2014 each step\u2019s output feeds the next.',
    whenToUse:
      'Run a 4-stage ETL (extract, transform, validate, load) with live progress streaming.',
    category: 'data-processing',
  },
  'batch-processor': {
    slug: 'batch-processor',
    title: 'Batch Processor',
    description:
      'Collect items over time or up to a size, then process them as a single batch.',
    whenToUse:
      'Process a large CSV import in batches, auto-resuming from the last completed batch after a crash.',
    category: 'data-processing',
  },
  'map-reduce': {
    slug: 'map-reduce',
    title: 'Map-Reduce',
    description:
      'Map work in parallel, then reduce partial results into a single answer.',
    whenToUse:
      'Partition a large analytics dataset into chunks, process in parallel, and merge into one report.',
    category: 'data-processing',
  },
  'scatter-gather': {
    slug: 'scatter-gather',
    title: 'Scatter-Gather',
    description:
      'Fan out to many workers, then collect and merge their replies.',
    whenToUse:
      'Query 4 shipping providers for quotes in parallel and pick the cheapest one that responds.',
    category: 'data-processing',
  },
  aggregator: {
    slug: 'aggregator',
    title: 'Aggregator',
    description:
      'Merge many parallel outcomes into one combined result (pair with scatter-gather / fan-out).',
    whenToUse:
      'Collect inventory from multiple warehouses with a timeout so stragglers do not block checkout.',
    category: 'data-processing',
  },
  splitter: {
    slug: 'splitter',
    title: 'Splitter',
    description:
      'Break one compound message into many smaller messages for downstream steps.',
    whenToUse:
      'Split a multi-item order into individual line items for independent validation and fulfillment.',
    category: 'data-processing',
  },
  resequencer: {
    slug: 'resequencer',
    title: 'Resequencer',
    description:
      'Buffer and reorder out-of-order messages before the next stage.',
    whenToUse:
      'Buffer out-of-order webhook fragments and release them in the correct sequence.',
    category: 'data-processing',
  },
  'competing-consumers': {
    slug: 'competing-consumers',
    title: 'Competing Consumers',
    description:
      'Multiple workers consume the same kind of work for throughput and scale-out.',
    whenToUse:
      'Multiple workflow instances race to claim items from a shared queue \u2014 only one wins each item.',
    category: 'data-processing',
  },
  'priority-queue': {
    slug: 'priority-queue',
    title: 'Priority Queue',
    description: 'Prefer higher-priority work when multiple items are waiting.',
    whenToUse:
      'Process enterprise-tier jobs before free-tier jobs when the queue is backed up.',
    category: 'data-processing',
  },
  'content-based-router': {
    slug: 'content-based-router',
    title: 'Content-Based Router',
    description:
      'Branch to different handlers based on fields inside the message or payload.',
    whenToUse:
      'Classify a support ticket and route it to billing, technical, account, or feedback handlers.',
    category: 'routing',
  },
  detour: {
    slug: 'detour',
    title: 'Detour',
    description:
      'Temporarily bypass or replace a step (e.g. maintenance, A/B, fallback path).',
    whenToUse:
      'Toggle a QA review stage on/off in a deploy pipeline based on a runtime feature flag.',
    category: 'routing',
  },
  'routing-slip': {
    slug: 'routing-slip',
    title: 'Routing Slip',
    description:
      'Attach an itinerary to the message so each hop knows where to send it next.',
    whenToUse:
      'Execute a flexible sequence of processing stages defined per-request in a routing slip.',
    category: 'routing',
  },
  'message-translator': {
    slug: 'message-translator',
    title: 'Message Translator',
    description:
      'Convert between external and internal message formats at the boundary.',
    whenToUse:
      'Convert partner XML orders into your internal JSON schema at the API boundary.',
    category: 'routing',
  },
  normalizer: {
    slug: 'normalizer',
    title: 'Normalizer',
    description:
      'Map heterogeneous inputs into one canonical shape before routing.',
    whenToUse:
      'Accept orders as XML, CSV, or legacy JSON and transform them into a single canonical shape.',
    category: 'routing',
  },
  'content-enricher': {
    slug: 'content-enricher',
    title: 'Content Enricher',
    description:
      'Look up extra data and attach it before the next step sees the message.',
    whenToUse:
      'Enrich a sales lead by querying CRM, social, and Clearbit in parallel before routing to sales.',
    category: 'routing',
  },
  'message-filter': {
    slug: 'message-filter',
    title: 'Message Filter',
    description:
      'Drop or accept messages based on rules before downstream processing.',
    whenToUse:
      'Drop low-priority log events before they hit the expensive analytics pipeline.',
    category: 'routing',
  },
  'wire-tap': {
    slug: 'wire-tap',
    title: 'Wire Tap',
    description:
      'Observe or copy messages in flight for logging/debugging without changing the main path.',
    whenToUse:
      'Mirror production order events to a debug logger without touching the main processing path.',
    category: 'observability',
  },
  'message-history': {
    slug: 'message-history',
    title: 'Message History',
    description:
      'Keep an audit trail of what passed through the flow and in what order.',
    whenToUse:
      'Track a support ticket through normalize, classify, route, dispatch with full history at each step.',
    category: 'observability',
  },
  'correlation-identifier': {
    slug: 'correlation-identifier',
    title: 'Correlation Identifier',
    description:
      'Tie outbound requests to the right workflow run when async replies arrive.',
    whenToUse:
      'Tag outbound API calls with a correlation ID so async responses match back to the right order.',
    category: 'observability',
  },
  'event-sourcing': {
    slug: 'event-sourcing',
    title: 'Event Sourcing',
    description:
      'Drive behavior from an append-only event log; rebuild or audit state from history.',
    whenToUse:
      'Append domain events to an immutable log and replay them to detect bugs or migrate projections.',
    category: 'observability',
  },
  'namespaced-streams': {
    slug: 'namespaced-streams',
    title: 'Namespaced Streams',
    description:
      'Separate streams (e.g. per tenant or topic) so clients only see relevant events.',
    whenToUse:
      'Emit workflow events to separate UI and ops-telemetry streams simultaneously.',
    category: 'observability',
  },
};

/** The decision tree */
export const tree: TreeNode = {
  id: 'root',
  question: 'I want to\u2026',
  branches: [
    {
      label: 'Process payments & orders',
      icon: '$',
      next: {
        id: 'payments',
        question: 'What happens if a step fails?',
        branches: [
          {
            label: 'Roll back everything automatically',
            icon: '\u21a9',
            slugs: ['saga'],
          },
          {
            label: 'Let services react independently',
            icon: '\u26a1',
            slugs: ['choreography'],
          },
          {
            label: 'Orchestrate with branching logic',
            icon: '\u25c8',
            slugs: ['process-manager', 'pipeline'],
          },
          {
            label: 'Make sure nothing gets lost',
            icon: '\u2713',
            slugs: [
              'guaranteed-delivery',
              'transactional-outbox',
              'idempotent-receiver',
            ],
          },
        ],
      },
    },
    {
      label: 'Approve or review something',
      icon: '\u270b',
      next: {
        id: 'approve',
        question: 'How many approvers?',
        branches: [
          {
            label: 'One person',
            icon: '1',
            slugs: ['approval-gate', 'cancellable-export'],
          },
          {
            label: 'A chain of approvers',
            icon: '\u22ef',
            slugs: ['approval-chain', 'scheduler-agent-supervisor'],
          },
        ],
      },
    },
    {
      label: 'Handle flaky APIs',
      icon: '\u21bb',
      next: {
        id: 'flaky',
        question: "What's going wrong?",
        branches: [
          {
            label: 'Random failures or timeouts',
            icon: '\u26a0',
            slugs: ['retry-backoff'],
          },
          {
            label: 'Rate limited (429s)',
            icon: '\u2298',
            slugs: ['retryable-rate-limit', 'throttle'],
          },
          {
            label: 'Service is fully down',
            icon: '\u2715',
            slugs: ['circuit-breaker', 'bulkhead'],
          },
          {
            label: 'Too slow, need a faster fallback',
            icon: '\u23f1',
            slugs: ['hedge-request', 'dead-letter-queue'],
          },
        ],
      },
    },
    {
      label: 'Send notifications & alerts',
      icon: '\u2192',
      next: {
        id: 'notify',
        question: 'How should they be sent?',
        branches: [
          {
            label: 'All at once, in parallel',
            icon: '\u2ad8',
            slugs: ['fan-out', 'publish-subscribe'],
          },
          {
            label: 'Only to matching recipients',
            icon: '\u2442',
            slugs: ['recipient-list'],
          },
          {
            label: 'Spread out over days or weeks',
            icon: '\u25f4',
            slugs: ['onboarding-drip', 'wakeable-reminder'],
          },
          {
            label: 'Batched into a digest',
            icon: '\u25a4',
            slugs: ['scheduled-digest'],
          },
        ],
      },
    },
    {
      label: 'Wait for a webhook or callback',
      icon: '\u2193',
      next: {
        id: 'wait',
        question: 'What are you waiting for?',
        branches: [
          {
            label: 'An async API response',
            icon: '\u21c4',
            slugs: ['async-request-reply', 'request-reply'],
          },
          {
            label: 'An inbound webhook',
            icon: '\u2193',
            slugs: ['webhook-basics', 'claim-check'],
          },
          {
            label: 'Multiple signals to converge',
            icon: '\u2295',
            slugs: ['event-gateway'],
          },
          {
            label: 'A job to finish (polling)',
            icon: '\u25f4',
            slugs: ['status-poller'],
          },
        ],
      },
    },
    {
      label: 'Process data in bulk',
      icon: '\u25a4',
      next: {
        id: 'bulk',
        question: "What's the shape of the work?",
        branches: [
          {
            label: 'Linear pipeline (A then B then C)',
            icon: '\u25b8',
            slugs: ['pipeline', 'batch-processor'],
          },
          {
            label: 'Parallel map, then merge results',
            icon: '\u2295',
            slugs: ['map-reduce', 'scatter-gather', 'aggregator'],
          },
          {
            label: 'Split one payload into many',
            icon: '\u2ad8',
            slugs: ['splitter', 'resequencer'],
          },
          {
            label: 'Many workers competing for items',
            icon: '\u2299',
            slugs: ['competing-consumers', 'priority-queue'],
          },
        ],
      },
    },
    {
      label: 'Route to the right handler',
      icon: '\u2442',
      next: {
        id: 'route',
        question: "What's the main operation?",
        branches: [
          {
            label: 'Branch based on message content',
            icon: '\u25c8',
            slugs: ['content-based-router', 'detour'],
          },
          {
            label: 'Dynamic route list per request',
            icon: '\u22ef',
            slugs: ['routing-slip', 'recipient-list'],
          },
          {
            label: 'Transform or normalize the format',
            icon: '\u21c4',
            slugs: ['message-translator', 'normalizer', 'content-enricher'],
          },
          {
            label: 'Filter out noise before processing',
            icon: '\u2715',
            slugs: ['message-filter'],
          },
        ],
      },
    },
    {
      label: 'Observe & audit the flow',
      icon: '\u25ce',
      slugs: [
        'wire-tap',
        'message-history',
        'correlation-identifier',
        'event-sourcing',
        'namespaced-streams',
      ],
    },
  ],
};
