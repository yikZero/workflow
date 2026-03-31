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
  | 'common-patterns'
  | 'agent-patterns'
  | 'integrations'
  | 'advanced';

export const categoryOrder: RecipeCategory[] = [
  'common-patterns',
  'agent-patterns',
  'integrations',
  'advanced',
];

export const categoryLabels: Record<RecipeCategory, string> = {
  'common-patterns': 'Common Patterns',
  'agent-patterns': 'Agent Patterns',
  integrations: 'Integrations',
  advanced: 'Advanced',
};

/** Map from slug → category folder for URL construction */
export const slugToCategory: Record<string, string> = {
  // Common Patterns
  saga: 'common-patterns',
  batching: 'common-patterns',
  'rate-limiting': 'common-patterns',
  'fan-out': 'common-patterns',
  scheduling: 'common-patterns',
  idempotency: 'common-patterns',
  webhooks: 'common-patterns',
  'content-router': 'common-patterns',
  'child-workflows': 'common-patterns',

  // Agent Patterns
  'durable-agent': 'agent-patterns',
  'tool-streaming': 'agent-patterns',
  'human-in-the-loop': 'agent-patterns',
  'tool-orchestration': 'agent-patterns',
  'stop-workflow': 'agent-patterns',

  // Integrations
  'ai-sdk': 'integrations',
  sandbox: 'integrations',
  'chat-sdk': 'integrations',

  // Advanced
  'serializable-steps': 'advanced',
  'durable-objects': 'advanced',
  'isomorphic-packages': 'advanced',
  'secure-credentials': 'advanced',
  'custom-serialization': 'advanced',
  'publishing-libraries': 'advanced',
};

/** All recipe metadata, keyed by slug */
export const recipes: Record<string, Recipe> = {
  // Common Patterns
  saga: {
    slug: 'saga',
    title: 'Transactions & Rollbacks (Saga)',
    description:
      'Coordinate multi-step transactions with automatic rollback when a step fails.',
    whenToUse:
      'Run a sequence of steps where each registers a compensation. If any step throws a FatalError, compensations execute in reverse order.',
    category: 'common-patterns',
  },
  batching: {
    slug: 'batching',
    title: 'Batching & Parallel Processing',
    description:
      'Process large collections in parallel batches with failure isolation between groups.',
    whenToUse:
      'Split items into fixed-size batches, process each batch concurrently with Promise.allSettled, and pace batches with sleep.',
    category: 'common-patterns',
  },
  'rate-limiting': {
    slug: 'rate-limiting',
    title: 'Rate Limiting & Retries',
    description:
      'Handle 429 responses and transient failures with RetryableError and exponential backoff.',
    whenToUse:
      'When an external API returns 429, throw RetryableError with the Retry-After value so the runtime reschedules the step.',
    category: 'common-patterns',
  },
  'fan-out': {
    slug: 'fan-out',
    title: 'Fan-Out & Parallel Delivery',
    description:
      'Send a message to multiple channels or recipients in parallel with independent failure handling.',
    whenToUse:
      'Fan out an alert to Slack, email, SMS, and PagerDuty simultaneously so a failure in one channel does not block the others.',
    category: 'common-patterns',
  },
  scheduling: {
    slug: 'scheduling',
    title: 'Sleep, Scheduling & Timed Workflows',
    description:
      'Use durable sleep to schedule actions minutes, hours, days, or weeks into the future.',
    whenToUse:
      'Schedule future actions with durable sleep that survives cold starts, and race sleeps against hooks for early wake.',
    category: 'common-patterns',
  },
  idempotency: {
    slug: 'idempotency',
    title: 'Idempotency',
    description:
      'Ensure external side effects happen exactly once, even when steps are retried or workflows are replayed.',
    whenToUse:
      'Use step IDs as idempotency keys for external APIs like Stripe so retries and replays do not create duplicates.',
    category: 'common-patterns',
  },
  webhooks: {
    slug: 'webhooks',
    title: 'Webhooks & External Callbacks',
    description:
      'Receive HTTP callbacks from external services, process them durably, and respond inline.',
    whenToUse:
      'Create webhook endpoints that your workflow can await, process incoming requests in steps, and respond to the caller.',
    category: 'common-patterns',
  },
  'content-router': {
    slug: 'content-router',
    title: 'Conditional Routing',
    description:
      'Inspect a payload and route it to different step handlers based on its content.',
    whenToUse:
      'Classify incoming messages and branch to specialized handlers using standard if/else logic in the workflow function.',
    category: 'common-patterns',
  },

  'child-workflows': {
    slug: 'child-workflows',
    title: 'Child Workflows',
    description:
      'Spawn and orchestrate child workflows from a parent, polling for completion and handling partial failures.',
    whenToUse:
      'Fan out work to independent child workflows via start(), poll with getRun() and sleep(), and collect results.',
    category: 'common-patterns',
  },

  // Agent Patterns
  'durable-agent': {
    slug: 'durable-agent',
    title: 'Durable Agent',
    description:
      'Replace a stateless AI agent with a durable one that survives crashes, retries tool calls, and streams output.',
    whenToUse:
      'Convert an AI SDK Agent into a DurableAgent backed by a workflow, with tools as retryable steps.',
    category: 'agent-patterns',
  },
  'tool-streaming': {
    slug: 'tool-streaming',
    title: 'Tool Streaming',
    description:
      'Stream real-time progress updates from tools to the UI while they execute.',
    whenToUse:
      'Emit custom data parts from step functions to show incremental results during long-running tool calls.',
    category: 'agent-patterns',
  },
  'human-in-the-loop': {
    slug: 'human-in-the-loop',
    title: 'Human-in-the-Loop',
    description:
      'Pause an AI agent to wait for human approval, then resume based on the decision.',
    whenToUse:
      'Use defineHook with the tool call ID to suspend an agent for human approval, with an optional timeout.',
    category: 'agent-patterns',
  },
  'tool-orchestration': {
    slug: 'tool-orchestration',
    title: 'Tool Orchestration',
    description:
      'Choose between step-level and workflow-level tools, or combine both for complex tool implementations.',
    whenToUse:
      'Implement tools as steps for retries and I/O, at the workflow level for sleep and hooks, or combine both.',
    category: 'agent-patterns',
  },
  'stop-workflow': {
    slug: 'stop-workflow',
    title: 'Stop Workflow',
    description:
      'Gracefully cancel a running agent workflow using a hook signal.',
    whenToUse:
      'Use a hook as a stop signal to break out of an agent loop and close the stream cleanly.',
    category: 'agent-patterns',
  },

  // Integrations
  'ai-sdk': {
    slug: 'ai-sdk',
    title: 'AI SDK',
    description:
      'Use AI SDK model providers, tool calling, and streaming inside durable workflows.',
    whenToUse:
      'Turn any AI SDK model call into a retryable, observable workflow step with built-in streaming.',
    category: 'integrations',
  },
  sandbox: {
    slug: 'sandbox',
    title: 'Sandbox',
    description:
      'Orchestrate Vercel Sandbox lifecycle \u2014 creation, code execution, snapshotting \u2014 inside durable workflows.',
    whenToUse:
      'Use workflow steps to provision sandboxes, run code, and manage sandbox lifecycle with automatic cleanup on failure.',
    category: 'integrations',
  },
  'chat-sdk': {
    slug: 'chat-sdk',
    title: 'Chat SDK',
    description:
      'Build durable chat sessions by combining workflow persistence with AI SDK chat primitives.',
    whenToUse:
      'Use workflow hooks and streaming to create chat sessions that survive disconnects and server restarts.',
    category: 'integrations',
  },

  // Advanced
  'serializable-steps': {
    slug: 'serializable-steps',
    title: 'Serializable Steps',
    description:
      'Wrap non-serializable objects (like AI model providers) inside step functions so they can cross the workflow boundary.',
    whenToUse:
      'Return a callback from a step to defer provider initialization, making non-serializable AI SDK models work inside durable workflows.',
    category: 'advanced',
  },
  'durable-objects': {
    slug: 'durable-objects',
    title: 'Durable Objects',
    description:
      'Model long-lived stateful entities as workflows that persist state across requests.',
    whenToUse:
      'Build a durable counter or session object whose state survives restarts by using the event log as the persistence layer.',
    category: 'advanced',
  },
  'isomorphic-packages': {
    slug: 'isomorphic-packages',
    title: 'Isomorphic Packages',
    description:
      'Publish reusable workflow packages that work both inside and outside the workflow runtime.',
    whenToUse:
      'Use try/catch around getWorkflowMetadata, dynamic imports, and optional peer dependencies for dual-environment libraries.',
    category: 'advanced',
  },
  'secure-credentials': {
    slug: 'secure-credentials',
    title: 'Secure Credentials',
    description:
      'Encrypt secrets before passing them through workflows so they never appear in the event log.',
    whenToUse:
      'Encrypt credentials before start(), resolve them inside steps via a provider, and avoid making secret-returning functions into steps.',
    category: 'advanced',
  },
  'custom-serialization': {
    slug: 'custom-serialization',
    title: 'Custom Serialization',
    description:
      'Make custom classes survive workflow serialization using the WORKFLOW_SERIALIZE/WORKFLOW_DESERIALIZE protocol.',
    whenToUse:
      'Implement static serde symbols on a class so instances can cross the workflow/step boundary intact.',
    category: 'advanced',
  },
  'publishing-libraries': {
    slug: 'publishing-libraries',
    title: 'Publishing Libraries',
    description:
      'Ship an npm package that exports reusable workflow functions with stable IDs and clean step I/O.',
    whenToUse:
      'Structure, test, and publish a library that consumers can import and start() in their own workflow apps.',
    category: 'advanced',
  },
};

/** Build a cookbook recipe href */
export function getRecipeHref(lang: string, slug: string): string {
  return `/${lang}/cookbook/${slugToCategory[slug]}/${slug}`;
}

/** Get recipes for a category, in definition order */
export function getRecipesByCategory(category: RecipeCategory): Recipe[] {
  return Object.values(recipes).filter((r) => r.category === category);
}

/** Recursively collect all slugs reachable from a branch */
export function collectSlugs(branch: Branch): string[] {
  const slugs = branch.slugs ?? [];
  if (branch.next) {
    return [...slugs, ...branch.next.branches.flatMap(collectSlugs)];
  }
  return slugs;
}

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
            label: 'Make sure nothing is duplicated',
            icon: '\u2713',
            slugs: ['idempotency'],
          },
          {
            label: 'Route to the right handler',
            icon: '\u25c8',
            slugs: ['content-router'],
          },
        ],
      },
    },
    {
      label: 'Build a durable AI agent',
      icon: '\u2605',
      next: {
        id: 'agent',
        question: 'What does the agent need?',
        branches: [
          {
            label: 'Basic durable agent setup',
            icon: '\u25b8',
            slugs: ['durable-agent'],
          },
          {
            label: 'Stream progress from tools',
            icon: '\u2192',
            slugs: ['tool-streaming'],
          },
          {
            label: 'Wait for human approval',
            icon: '\u270b',
            slugs: ['human-in-the-loop'],
          },
          {
            label: 'Complex tool patterns',
            icon: '\u2699',
            slugs: ['tool-orchestration', 'stop-workflow'],
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
            label: 'Rate limited (429s)',
            icon: '\u2298',
            slugs: ['rate-limiting'],
          },
          {
            label: 'Need parallel processing with isolation',
            icon: '\u25a4',
            slugs: ['batching'],
          },
          {
            label: 'Orchestrate many child workflows',
            icon: '\u2b50',
            slugs: ['child-workflows'],
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
            slugs: ['fan-out'],
          },
          {
            label: 'Spread out over days or weeks',
            icon: '\u25f4',
            slugs: ['scheduling'],
          },
        ],
      },
    },
    {
      label: 'Wait for a webhook or callback',
      icon: '\u2193',
      slugs: ['webhooks'],
    },
    {
      label: 'Integrate with Vercel products',
      icon: '\u25b2',
      next: {
        id: 'integrate',
        question: 'Which product?',
        branches: [
          {
            label: 'AI SDK',
            icon: '\u2605',
            slugs: ['ai-sdk'],
          },
          {
            label: 'Chat SDK',
            icon: '\u2328',
            slugs: ['chat-sdk'],
          },
          {
            label: 'Sandbox',
            icon: '\u2610',
            slugs: ['sandbox'],
          },
        ],
      },
    },
    {
      label: 'Advanced internals',
      icon: '\u2699',
      slugs: [
        'serializable-steps',
        'durable-objects',
        'isomorphic-packages',
        'secure-credentials',
        'custom-serialization',
        'publishing-libraries',
      ],
    },
  ],
};
