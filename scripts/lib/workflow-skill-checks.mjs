/**
 * Shared check registry for workflow skill validation.
 * Imported by both the CLI validator and the test suite.
 */

export const checks = [
  {
    ruleId: 'skill.workflow-teach',
    file: 'skills/workflow-teach/SKILL.md',
    mustInclude: [
      '.workflow-skills/context.json',
      'projectName',
      'productGoal',
      'triggerSurfaces',
      'externalSystems',
      'antiPatterns',
      'canonicalExamples',
      'getWritable()` may be called in either',
    ],
    mustNotInclude: [
      '`getWritable()` and stream consumption must happen inside',
      '`getWritable()` must be in a step',
    ],
  },
  {
    ruleId: 'skill.workflow-teach.sequencing',
    file: 'skills/workflow-teach/SKILL.md',
    mustInclude: [
      'workflow-design',
      'workflow-stress',
      'externally-driven workflows',
    ],
    mustAppearInOrder: ['workflow-design', 'workflow-stress'],
    suggestedFix:
      'Document externally-driven workflows as workflow-design followed immediately by workflow-stress.',
  },
  {
    ruleId: 'skill.workflow-design',
    file: 'skills/workflow-design/SKILL.md',
    mustInclude: [
      'WorkflowBlueprint',
      '"use workflow"',
      '"use step"',
      'createHook',
      'createWebhook',
      'getWritable',
      'RetryableError',
      'FatalError',
      'start()',
      'getWritable()` may be called in workflow or step context',
    ],
    mustNotInclude: [
      '`getWritable()` and any stream consumption must be inside `"use step"`',
    ],
  },
  {
    ruleId: 'skill.workflow-design.sequencing',
    file: 'skills/workflow-design/SKILL.md',
    mustInclude: [
      'workflow-stress',
      'workflow-verify',
      'hooks, webhooks, sleep, streams, retries, or child workflows',
    ],
    mustAppearInOrder: ['workflow-stress', 'workflow-verify'],
    suggestedFix:
      'Document advanced designs as workflow-stress before workflow-verify.',
  },
  {
    ruleId: 'skill.workflow-stress',
    file: 'skills/workflow-stress/SKILL.md',
    mustInclude: [
      'determinism boundary',
      'step granularity',
      'serialization issues',
      'idempotency keys',
      'Blueprint Patch',
      'getWritable()` is called in workflow context',
      'seeded workflow-context APIs',
    ],
    mustNotInclude: [
      'Is `getWritable()` called from workflow context? (It must be in a step.)',
      'access `Date.now()`, `Math.random()`',
      'Are all non-deterministic operations isolated in `"use step"` functions?',
    ],
  },
  {
    ruleId: 'skill.workflow-verify',
    file: 'skills/workflow-verify/SKILL.md',
    mustInclude: [
      'waitForHook()',
      'resumeHook()',
      'resumeWebhook()',
      'waitForSleep()',
      'wakeUp',
      'run.returnValue',
      'new Request(',
      'JSON.stringify(',
    ],
    mustNotInclude: ["resumeWebhook('webhook-token', {", 'status: 200,'],
  },
  {
    ruleId: 'skill.workflow-verify.sequencing',
    file: 'skills/workflow-verify/SKILL.md',
    mustInclude: [
      'original or a stress-patched version',
    ],
  },
];

export const goldenChecks = [
  {
    ruleId: 'golden.approval-hook-sleep',
    file: 'skills/workflow-design/goldens/approval-hook-sleep.md',
    mustInclude: [
      'createHook',
      'sleep',
      'resumeHook',
      'waitForHook',
      'waitForSleep',
      'wakeUp',
      'antiPatternsAvoided',
      'deterministic',
    ],
  },
  {
    ruleId: 'golden.webhook-ingress',
    file: 'skills/workflow-design/goldens/webhook-ingress.md',
    mustInclude: [
      'createWebhook',
      'resumeWebhook',
      'waitForHook',
      'hook.token',
      'new Request(',
      'JSON.stringify(',
      'antiPatternsAvoided',
      'webhook',
    ],
    mustNotInclude: [
      'resumeWebhook(run, {',
      "resumeWebhook('webhook-token', {",
    ],
    suggestedFix:
      'Use waitForHook(run) to obtain hook.token, then call resumeWebhook(hook.token, new Request(...)).',
  },
  {
    ruleId: 'golden.human-in-the-loop-streaming',
    file: 'skills/workflow-design/goldens/human-in-the-loop-streaming.md',
    mustInclude: [
      'createHook',
      'getWritable',
      'stream',
      'resumeHook',
      'waitForHook',
      'antiPatternsAvoided',
      'getWritable()` may be called in workflow or step context',
    ],
    mustNotInclude: [
      '`getWritable()` and any stream\n  consumption must be inside steps',
      'Stream writes must be inside `"use step"` functions',
    ],
  },
];

export const stressGoldenChecks = [
  {
    ruleId: 'golden.stress.compensation-saga',
    file: 'skills/workflow-stress/goldens/compensation-saga.md',
    mustInclude: [
      'compensation',
      'idempotency',
      'Rollback',
      'Retry semantics',
      'Integration test coverage',
      'refundPayment',
    ],
  },
  {
    ruleId: 'golden.stress.child-workflow-handoff',
    file: 'skills/workflow-stress/goldens/child-workflow-handoff.md',
    mustInclude: [
      'start()',
      'runtime',
      'step',
      'serialization',
      'Step granularity',
      'start()` in workflow context must be wrapped in a step',
    ],
  },
  {
    ruleId: 'golden.stress.multi-event-hook-loop',
    file: 'skills/workflow-stress/goldens/multi-event-hook-loop.md',
    mustInclude: [
      'AsyncIterable',
      'Promise.all',
      'resumeHook',
      'deterministic',
      'Hook token strategy',
      'Suspension primitive choice',
    ],
  },
  {
    ruleId: 'golden.stress.rate-limit-retry',
    file: 'skills/workflow-stress/goldens/rate-limit-retry.md',
    mustInclude: [
      'RetryableError',
      'FatalError',
      '429',
      'idempotency',
      'Retry semantics',
      'backoff',
    ],
  },
  {
    ruleId: 'golden.stress.approval-timeout-streaming',
    file: 'skills/workflow-stress/goldens/approval-timeout-streaming.md',
    mustInclude: [
      'getWritable()',
      'stream',
      'waitForSleep',
      'wakeUp',
      'Determinism boundary',
      'Stream I/O placement',
      'getWritable()` may be called in workflow context',
    ],
    mustNotInclude: [
      '`getWritable()` must be in a step',
    ],
  },
];

export const allChecks = [...checks, ...goldenChecks, ...stressGoldenChecks];
