/**
 * Validation rules for the two-skill workflow pipeline: teach → build.
 *
 * Each check targets a specific file and declares required/forbidden content.
 * The validator engine in validate-workflow-skill-files.mjs runs these checks
 * against actual file contents.
 */

// ---------------------------------------------------------------------------
// workflow-teach checks
// ---------------------------------------------------------------------------

export const teachChecks = [
  {
    ruleId: 'skill.workflow-teach',
    file: 'skills/workflow-teach/SKILL.md',
    mustInclude: [
      '.workflow.md',
      '## Project Context',
      '## Business Rules',
      '## External Systems',
      '## Failure Expectations',
      '## Observability Needs',
      '## Approved Patterns',
      '## Open Questions',
    ],
    mustNotInclude: [
      '.workflow-skills/context.json',
      'contractVersion',
      'WorkflowBlueprint',
    ],
  },
  {
    ruleId: 'skill.workflow-teach.interview',
    file: 'skills/workflow-teach/SKILL.md',
    mustInclude: [
      'What starts this workflow',
      'Which side effects must be safe to repeat',
      'What counts as a permanent failure',
      'Does any step require human approval',
      'What timeout or expiry rules exist',
      'what compensation is required',
      'What must operators be able to observe',
    ],
  },
  {
    ruleId: 'skill.workflow-teach.loop-position',
    file: 'skills/workflow-teach/SKILL.md',
    mustInclude: ['Stage 1 of 2', 'workflow-build'],
    mustNotInclude: [
      'Stage 1 of 4',
      'workflow-design',
      'workflow-stress',
      'workflow-verify',
    ],
  },
];

// ---------------------------------------------------------------------------
// workflow-build checks
// ---------------------------------------------------------------------------

export const buildChecks = [
  {
    ruleId: 'skill.workflow-build',
    file: 'skills/workflow-build/SKILL.md',
    mustInclude: [
      '.workflow.md',
      'skills/workflow/SKILL.md',
      '"use workflow"',
      '"use step"',
      'createHook',
      'createWebhook',
      'getWritable',
      'RetryableError',
      'FatalError',
      'start()',
      'Determinism boundary',
      'Step granularity',
      'Idempotency keys',
      'Rollback',
      'compensation',
      'self-review',
      'Self-review',
    ],
    mustNotInclude: [
      'WorkflowBlueprint',
      '.workflow-skills/context.json',
      '.workflow-skills/blueprints',
    ],
  },
  {
    ruleId: 'skill.workflow-build.loop-position',
    file: 'skills/workflow-build/SKILL.md',
    mustInclude: ['Stage 2 of 2'],
    mustNotInclude: ['Stage 2 of 4', 'Stage 3 of 4', 'Stage 4 of 4'],
  },
  {
    ruleId: 'skill.workflow-build.stress-checklist',
    file: 'skills/workflow-build/SKILL.md',
    mustInclude: [
      '### 1. Determinism boundary',
      '### 2. Step granularity',
      '### 3. Pass-by-value',
      '### 4. Hook token strategy',
      '### 5. Webhook response mode',
      '### 6. `start()` placement',
      '### 7. Stream I/O placement',
      '### 8. Idempotency keys',
      '### 9. Retry semantics',
      '### 10. Rollback',
      '### 11. Observability streams',
      '### 12. Integration test coverage',
    ],
  },
  {
    ruleId: 'skill.workflow-build.hard-rules',
    file: 'skills/workflow-build/SKILL.md',
    mustInclude: [
      'Workflow functions orchestrate only',
      'All side effects live in',
      '`createHook()` may use deterministic tokens',
      '`createWebhook()` may NOT use deterministic tokens',
      'Stream I/O happens in steps',
      '`start()` inside a workflow must be wrapped in a step',
      'Return mutated values from steps',
    ],
  },
  {
    ruleId: 'skill.workflow-build.interactive-phases',
    file: 'skills/workflow-build/SKILL.md',
    mustInclude: [
      'Phase 1',
      'Phase 2',
      'Phase 3',
      'Phase 4',
      'Phase 5',
      'Propose step boundaries',
      'Flag relevant traps',
      'Decide failure modes',
      'Write code',
    ],
    mustAppearInOrder: ['Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5'],
  },
];

// ---------------------------------------------------------------------------
// Teach golden checks
// ---------------------------------------------------------------------------

export const teachGoldenChecks = [
  {
    ruleId: 'golden.teach.approval-expiry-escalation',
    file: 'skills/workflow-teach/goldens/approval-expiry-escalation.md',
    mustInclude: [
      '## Interview Context',
      '## Expected `.workflow.md` Sections',
      '### Business Rules',
      '### Failure Expectations',
      '### Observability Needs',
      'workflow-build',
    ],
    mustNotInclude: [
      'context.json',
      'WorkflowBlueprint',
      'workflow-design',
      'workflow-stress',
      'workflow-verify',
    ],
  },
  {
    ruleId: 'golden.teach.duplicate-webhook-order',
    file: 'skills/workflow-teach/goldens/duplicate-webhook-order.md',
    mustInclude: [
      '## Interview Context',
      '## Expected `.workflow.md` Sections',
      '### Business Rules',
      'idempotency',
      'workflow-build',
    ],
    mustNotInclude: ['context.json', 'WorkflowBlueprint'],
  },
  {
    ruleId: 'golden.teach.operator-observability-streams',
    file: 'skills/workflow-teach/goldens/operator-observability-streams.md',
    mustInclude: [
      '## Interview Context',
      '## Expected `.workflow.md` Sections',
      '### Observability Needs',
      'stream',
      'workflow-build',
    ],
    mustNotInclude: ['context.json', 'WorkflowBlueprint'],
  },
  {
    ruleId: 'golden.teach.partial-side-effect-compensation',
    file: 'skills/workflow-teach/goldens/partial-side-effect-compensation.md',
    mustInclude: [
      '## Interview Context',
      '## Expected `.workflow.md` Sections',
      '### Failure Expectations',
      'compensation',
      'workflow-build',
    ],
    mustNotInclude: ['context.json', 'WorkflowBlueprint'],
  },
];

// ---------------------------------------------------------------------------
// Build golden checks
// ---------------------------------------------------------------------------

export const buildGoldenChecks = [
  {
    ruleId: 'golden.build.compensation-saga',
    file: 'skills/workflow-build/goldens/compensation-saga.md',
    mustInclude: [
      '## What the Build Skill Should Catch',
      '### Phase 2',
      '### Phase 3',
      '## Expected Code Output',
      '"use step"',
      'compensation',
      'idempotency',
      'refund',
      '## Verification Artifact',
      '### Verification Summary',
      'verification_plan_ready',
    ],
    jsonFence: {
      language: 'json',
      requiredKeys: [
        'contractVersion',
        'blueprintName',
        'files',
        'testMatrix',
        'runtimeCommands',
        'implementationNotes',
      ],
      nonEmptyKeys: ['files', 'testMatrix', 'runtimeCommands'],
    },
    sectionHeading: '## Verification Artifact',
    mustIncludeWithinSection: [
      'testMatrix',
      'runtimeCommands',
      'implementationNotes',
    ],
    suggestedFix:
      'Inside `## Verification Artifact`, add a fenced `json` block containing `contractVersion`, `blueprintName`, `files`, `testMatrix`, `runtimeCommands`, and `implementationNotes`. Immediately after the fence, add `### Verification Summary` followed by a single-line `{"event":"verification_plan_ready",...}` JSON object.',
  },
  {
    ruleId: 'golden.build.child-workflow-handoff',
    file: 'skills/workflow-build/goldens/child-workflow-handoff.md',
    mustInclude: [
      '## What the Build Skill Should Catch',
      '### Phase 2',
      '## Expected Code Output',
      '"use step"',
      'start()',
    ],
  },
  {
    ruleId: 'golden.build.rate-limit-retry',
    file: 'skills/workflow-build/goldens/rate-limit-retry.md',
    mustInclude: [
      '## What the Build Skill Should Catch',
      '### Phase 2',
      '### Phase 3',
      '## Expected Code Output',
      'RetryableError',
      'FatalError',
      '429',
    ],
  },
  {
    ruleId: 'golden.build.approval-timeout-streaming',
    file: 'skills/workflow-build/goldens/approval-timeout-streaming.md',
    mustInclude: [
      '## What the Build Skill Should Catch',
      '### Phase 2',
      '## Expected Code Output',
      '## Expected Test Output',
      'getWritable',
      'waitForHook',
      'resumeHook',
      'waitForSleep',
      'wakeUp',
    ],
  },
  {
    ruleId: 'golden.build.multi-event-hook-loop',
    file: 'skills/workflow-build/goldens/multi-event-hook-loop.md',
    mustInclude: [
      '## What the Build Skill Should Catch',
      '### Phase 2',
      '## Expected Code Output',
      '## Expected Test Output',
      'createHook',
      'Promise.all',
      'deterministic',
    ],
  },
];

// ---------------------------------------------------------------------------
// Scenario skill checks: workflow-approval
// ---------------------------------------------------------------------------

export const approvalChecks = [
  {
    ruleId: 'skill.workflow-approval',
    file: 'skills/workflow-approval/SKILL.md',
    mustInclude: [
      'user-invocable: true',
      'argument-hint:',
      '.workflow.md',
      'approval',
      'createHook',
      'sleep',
      'escalation',
      'deterministic',
      'verification_plan_ready',
    ],
    mustNotInclude: [
      '.workflow-skills/',
      'WorkflowBlueprint',
    ],
  },
  {
    ruleId: 'skill.workflow-approval.context-capture',
    file: 'skills/workflow-approval/SKILL.md',
    mustInclude: [
      'Approval actors',
      'Timeout/expiry rules',
      'Hook token strategy',
    ],
  },
  {
    ruleId: 'skill.workflow-approval.required-constraints',
    file: 'skills/workflow-approval/SKILL.md',
    mustInclude: [
      'Deterministic hook tokens',
      'Expiry via `sleep()`',
      'Escalation behavior',
      'Promise.race',
    ],
  },
  {
    ruleId: 'skill.workflow-approval.test-coverage',
    file: 'skills/workflow-approval/SKILL.md',
    mustInclude: [
      'waitForHook',
      'resumeHook',
      'waitForSleep',
      'wakeUp',
    ],
  },
];

// ---------------------------------------------------------------------------
// Scenario skill checks: workflow-webhook
// ---------------------------------------------------------------------------

export const webhookChecks = [
  {
    ruleId: 'skill.workflow-webhook',
    file: 'skills/workflow-webhook/SKILL.md',
    mustInclude: [
      'user-invocable: true',
      'argument-hint:',
      '.workflow.md',
      'webhook',
      'duplicate',
      'idempotency',
      'verification_plan_ready',
    ],
    mustNotInclude: [
      '.workflow-skills/',
      'WorkflowBlueprint',
    ],
  },
  {
    ruleId: 'skill.workflow-webhook.context-capture',
    file: 'skills/workflow-webhook/SKILL.md',
    mustInclude: [
      'Webhook source',
      'Duplicate handling',
      'Idempotency strategy',
      'Response timeout',
      'Compensation requirements',
    ],
  },
  {
    ruleId: 'skill.workflow-webhook.required-constraints',
    file: 'skills/workflow-webhook/SKILL.md',
    mustInclude: [
      'Duplicate-delivery handling',
      'Stable idempotency keys',
      'Webhook response mode',
      'static',
      'manual',
      'Compensation when downstream steps fail',
    ],
  },
  {
    ruleId: 'skill.workflow-webhook.test-coverage',
    file: 'skills/workflow-webhook/SKILL.md',
    mustInclude: [
      'Happy path',
      'Duplicate webhook',
      'Compensation path',
    ],
  },
];

// ---------------------------------------------------------------------------
// Scenario golden checks
// ---------------------------------------------------------------------------

export const approvalGoldenChecks = [
  {
    ruleId: 'golden.approval.approval-expiry-escalation',
    file: 'skills/workflow-approval/goldens/approval-expiry-escalation.md',
    mustInclude: [
      '## Context Capture',
      '## What the Scenario Skill Should Catch',
      '### Phase 2',
      '### Phase 3',
      '## Expected Code Output',
      '## Expected Test Output',
      '"use step"',
      'createHook',
      'sleep',
      'escalation',
      'waitForHook',
      'resumeHook',
      'waitForSleep',
      'wakeUp',
      '## Verification Artifact',
      '### Verification Summary',
      'verification_plan_ready',
    ],
    mustNotInclude: [
      '.workflow-skills/',
      'WorkflowBlueprint',
    ],
    jsonFence: {
      language: 'json',
      requiredKeys: [
        'contractVersion',
        'blueprintName',
        'files',
        'testMatrix',
        'runtimeCommands',
        'implementationNotes',
      ],
      nonEmptyKeys: ['files', 'testMatrix', 'runtimeCommands'],
    },
    sectionHeading: '## Verification Artifact',
    mustIncludeWithinSection: [
      'testMatrix',
      'runtimeCommands',
      'implementationNotes',
    ],
    suggestedFix:
      'Inside `## Verification Artifact`, add a fenced `json` block containing `contractVersion`, `blueprintName`, `files`, `testMatrix`, `runtimeCommands`, and `implementationNotes`. Immediately after the fence, add `### Verification Summary` followed by a single-line `{"event":"verification_plan_ready",...}` JSON object.',
  },
];

export const webhookGoldenChecks = [
  {
    ruleId: 'golden.webhook.duplicate-webhook-order',
    file: 'skills/workflow-webhook/goldens/duplicate-webhook-order.md',
    mustInclude: [
      '## Context Capture',
      '## What the Scenario Skill Should Catch',
      '### Phase 2',
      '### Phase 3',
      '## Expected Code Output',
      '## Expected Test Output',
      '"use step"',
      'duplicate',
      'idempotency',
      'compensation',
      'refund',
      '## Verification Artifact',
      '### Verification Summary',
      'verification_plan_ready',
    ],
    mustNotInclude: [
      '.workflow-skills/',
      'WorkflowBlueprint',
    ],
    jsonFence: {
      language: 'json',
      requiredKeys: [
        'contractVersion',
        'blueprintName',
        'files',
        'testMatrix',
        'runtimeCommands',
        'implementationNotes',
      ],
      nonEmptyKeys: ['files', 'testMatrix', 'runtimeCommands'],
    },
    sectionHeading: '## Verification Artifact',
    mustIncludeWithinSection: [
      'testMatrix',
      'runtimeCommands',
      'implementationNotes',
    ],
    suggestedFix:
      'Inside `## Verification Artifact`, add a fenced `json` block containing `contractVersion`, `blueprintName`, `files`, `testMatrix`, `runtimeCommands`, and `implementationNotes`. Immediately after the fence, add `### Verification Summary` followed by a single-line `{"event":"verification_plan_ready",...}` JSON object.',
  },
];

// ---------------------------------------------------------------------------
// Aggregated check lists
// ---------------------------------------------------------------------------

export const checks = [...teachChecks, ...buildChecks, ...approvalChecks, ...webhookChecks];

export const allGoldenChecks = [...teachGoldenChecks, ...buildGoldenChecks, ...approvalGoldenChecks, ...webhookGoldenChecks];
