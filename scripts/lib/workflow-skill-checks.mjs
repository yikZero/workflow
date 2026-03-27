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
      'businessInvariants',
      'idempotencyRequirements',
      'approvalRules',
      'timeoutRules',
      'compensationRules',
      'observabilityRequirements',
      'openQuestions',
      'getWritable()` may be called in either',
    ],
    mustNotInclude: [
      '`getWritable()` and stream consumption must happen inside',
      '`getWritable()` must be in a step',
    ],
  },
  {
    ruleId: 'skill.workflow-teach.interview',
    file: 'skills/workflow-teach/SKILL.md',
    mustInclude: [
      'What starts this workflow, and who or what emits that event?',
      'Which side effects must be safe to repeat',
      'What counts as a permanent failure vs. a retryable failure?',
      'Does any step require human approval, and who is allowed to approve?',
      'What timeout or expiry rules exist?',
      'If a side effect succeeds and a later step fails, what compensation is required?',
      'What must operators be able to observe in logs/streams?',
      'not already inferable from the repo',
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
    mustAppearInOrder: [
      'recommend `workflow-design` followed immediately by',
      '`workflow-stress` to pressure-test the blueprint',
    ],
    suggestedFix:
      'For externally-driven workflows, recommend workflow-design before workflow-stress.',
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
      'invariants',
      'compensationPlan',
      'operatorSignals',
      'businessInvariants',
      'compensationRules',
      'observabilityRequirements',
      'idempotency rationale',
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
    mustAppearInOrder: [
      'run `workflow-stress` before `workflow-verify`',
      'hooks, webhooks, sleep, streams, retries, or child workflows',
    ],
    suggestedFix:
      'Mention workflow-stress before workflow-verify in the next-step guidance.',
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
    ruleId: 'skill.workflow-verify.contract-fields',
    file: 'skills/workflow-verify/SKILL.md',
    mustInclude: [
      'invariants',
      'compensationPlan',
      'operatorSignals',
      'failure-path',
      'stream/log',
    ],
    suggestedFix:
      'Make workflow-verify turn invariants into assertions, compensationPlan into failure-path coverage, and operatorSignals into runtime observability checks.',
  },
  {
    ruleId: 'skill.workflow-verify.sequencing',
    file: 'skills/workflow-verify/SKILL.md',
    mustInclude: ['original or a stress-patched version'],
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
    ruleId: 'golden.approval-hook-sleep.sequence',
    file: 'skills/workflow-design/goldens/approval-hook-sleep.md',
    mustInclude: [
      'await waitForHook(run',
      'await resumeHook(',
      'await waitForSleep(run)',
      '.wakeUp(',
    ],
    mustAppearInOrder: [
      'await waitForHook(run',
      'await resumeHook(',
      'await waitForSleep(run)',
      '.wakeUp(',
    ],
    suggestedFix:
      'Show hook wait/resume before sleep wait/wakeUp in the example flow.',
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
    ruleId: 'golden.webhook-ingress.sequence',
    file: 'skills/workflow-design/goldens/webhook-ingress.md',
    mustInclude: [
      'const hook = await waitForHook(run);',
      'await resumeWebhook(',
    ],
    mustAppearInOrder: [
      'const hook = await waitForHook(run);',
      'await resumeWebhook(',
    ],
    suggestedFix: 'Wait for webhook registration before calling resumeWebhook.',
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
    ruleId: 'golden.stress.compensation-saga.schema',
    file: 'skills/workflow-stress/goldens/compensation-saga.md',
    mustInclude: [
      '"invariants": [',
      '"compensationPlan": [',
      '"operatorSignals": [',
    ],
    suggestedFix:
      'Keep defective stress goldens semantically wrong, but structurally valid against WorkflowBlueprint.',
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
    mustNotInclude: ['`getWritable()` must be in a step'],
  },
];

export const teachGoldenChecks = [
  {
    ruleId: 'golden.teach.duplicate-webhook-order',
    file: 'skills/workflow-teach/goldens/duplicate-webhook-order.md',
    mustInclude: [
      'idempotency',
      'businessInvariants',
      'idempotencyRequirements',
      'compensationRules',
      'observabilityRequirements',
      'duplicate',
      'webhook',
    ],
  },
  {
    ruleId: 'golden.teach.approval-expiry-escalation',
    file: 'skills/workflow-teach/goldens/approval-expiry-escalation.md',
    mustInclude: [
      'approvalRules',
      'timeoutRules',
      'escalation',
      'deterministic',
      'hook',
      'sleep',
      'observabilityRequirements',
    ],
  },
  {
    ruleId: 'golden.teach.partial-side-effect-compensation',
    file: 'skills/workflow-teach/goldens/partial-side-effect-compensation.md',
    mustInclude: [
      'compensationRules',
      'businessInvariants',
      'compensation',
      'rollback',
      'idempotencyRequirements',
      'observabilityRequirements',
    ],
  },
  {
    ruleId: 'golden.teach.operator-observability-streams',
    file: 'skills/workflow-teach/goldens/operator-observability-streams.md',
    mustInclude: [
      'observabilityRequirements',
      'streams',
      'getWritable',
      'operatorSignals',
      'namespace',
      'businessInvariants',
    ],
  },
];

export const downstreamChecks = [
  {
    ruleId: 'downstream.design.invariants',
    file: 'skills/workflow-design/SKILL.md',
    mustInclude: [
      'invariants',
      'compensationPlan',
      'operatorSignals',
      'businessInvariants',
      'compensationRules',
      'observabilityRequirements',
    ],
    suggestedFix:
      'workflow-design must surface invariants, compensationPlan, and operatorSignals from context.',
  },
  {
    ruleId: 'downstream.design.idempotency-rationale',
    file: 'skills/workflow-design/SKILL.md',
    mustInclude: ['idempotency rationale', 'idempotency key'],
    suggestedFix:
      'workflow-design must require idempotency rationale for every irreversible side effect.',
  },
  {
    ruleId: 'downstream.stress.idempotency',
    file: 'skills/workflow-stress/SKILL.md',
    mustInclude: ['idempotency keys', 'idempotency strategy'],
    suggestedFix:
      'workflow-stress must enforce idempotency checks for every step with external side effects.',
  },
  {
    ruleId: 'downstream.stress.compensation',
    file: 'skills/workflow-stress/SKILL.md',
    mustInclude: ['compensation', 'Rollback', 'partial-success'],
    suggestedFix:
      'workflow-stress must enforce compensation policy for partial-success scenarios.',
  },
  {
    ruleId: 'downstream.stress.timeout',
    file: 'skills/workflow-stress/SKILL.md',
    mustInclude: ['timeout', 'failure paths'],
    suggestedFix:
      'workflow-stress must check timeout and expiry behavior for suspensions.',
  },
  {
    ruleId: 'downstream.verify.expiry-tests',
    file: 'skills/workflow-verify/SKILL.md',
    mustInclude: ['waitForSleep', 'wakeUp', 'resumeHook'],
    suggestedFix:
      'workflow-verify must generate tests exercising sleep/wakeUp for expiry and resumeHook for approvals.',
  },
];

export const allChecks = [
  ...checks,
  ...goldenChecks,
  ...stressGoldenChecks,
  ...teachGoldenChecks,
  ...downstreamChecks,
];
