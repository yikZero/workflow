import { describe, expect, it } from 'vitest';
import { validateWorkflowSkillText } from './lib/validate-workflow-skill-files.mjs';
import {
  allChecks,
  checks,
  downstreamChecks,
  heroGoldenChecks,
  stressGoldenChecks,
  teachGoldenChecks,
} from './lib/workflow-skill-checks.mjs';

function runSingleCheck(check, content) {
  return validateWorkflowSkillText([check], {
    [check.file]: content,
  });
}

describe('validateWorkflowSkillText', () => {
  it('returns ok:false for stale webhook golden with resumeWebhook(run, {)', () => {
    const checks = [
      {
        ruleId: 'golden.webhook-ingress',
        file: 'skills/workflow-design/goldens/webhook-ingress.md',
        mustInclude: [
          'createWebhook',
          'resumeWebhook',
          'hook.token',
          'new Request(',
        ],
        mustNotInclude: ['resumeWebhook(run, {'],
        suggestedFix:
          'Use waitForHook(run) to obtain hook.token, then call resumeWebhook(hook.token, new Request(...)).',
      },
    ];

    const staleContent = `
# Golden: Webhook Ingestion
createWebhook resumeWebhook waitForHook antiPatternsAvoided webhook
await resumeWebhook(run, { status: 200, body: {} });
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-design/goldens/webhook-ingress.md': staleContent,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('fail');
    expect(result.results[0].forbidden).toContain('resumeWebhook(run, {');
    expect(result.results[0].ruleId).toBe('golden.webhook-ingress');
    expect(result.results[0].suggestedFix).toContain('waitForHook');
  });

  it('returns ok:true for corrected webhook golden with hook.token + new Request(', () => {
    const checks = [
      {
        ruleId: 'golden.webhook-ingress',
        file: 'skills/workflow-design/goldens/webhook-ingress.md',
        mustInclude: [
          'createWebhook',
          'resumeWebhook',
          'hook.token',
          'new Request(',
          'JSON.stringify(',
        ],
        mustNotInclude: [
          'resumeWebhook(run, {',
          "resumeWebhook('webhook-token', {",
        ],
      },
    ];

    const correctContent = `
# Golden: Webhook Ingestion
createWebhook resumeWebhook waitForHook antiPatternsAvoided webhook
const hook = await waitForHook(run);
await resumeWebhook(hook.token, new Request('https://example.com/webhook', {
  body: JSON.stringify({ type: 'payment_intent.succeeded' }),
}));
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-design/goldens/webhook-ingress.md': correctContent,
    });

    expect(result.ok).toBe(true);
    expect(result.results[0].status).toBe('pass');
  });

  it('returns forbidden for legacy stream wording', () => {
    const checks = [
      {
        ruleId: 'golden.human-in-the-loop-streaming',
        file: 'skills/workflow-design/goldens/human-in-the-loop-streaming.md',
        mustInclude: ['createHook', 'getWritable'],
        mustNotInclude: ['Stream writes must be inside `"use step"` functions'],
      },
    ];

    const badContent = `
createHook getWritable stream resumeHook waitForHook antiPatternsAvoided
Stream writes must be inside \`"use step"\` functions
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-design/goldens/human-in-the-loop-streaming.md':
        badContent,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].forbidden).toContain(
      'Stream writes must be inside `"use step"` functions'
    );
  });

  it('returns file_not_found for missing files', () => {
    const checks = [
      {
        ruleId: 'test.missing',
        file: 'does/not/exist.md',
        mustInclude: ['foo'],
      },
    ];

    const result = validateWorkflowSkillText(checks, {});

    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('error');
    expect(result.results[0].error).toBe('file_not_found');
    expect(result.results[0].ruleId).toBe('test.missing');
  });

  it('includes ruleId, severity, and suggestedFix in failure output', () => {
    const checks = [
      {
        ruleId: 'golden.webhook.request-payload',
        severity: 'error',
        file: 'test.md',
        mustInclude: ['hook.token'],
        mustNotInclude: ['resumeWebhook(run, {'],
        suggestedFix: 'Use hook.token instead of run.',
      },
    ];

    const result = validateWorkflowSkillText(checks, {
      'test.md': 'resumeWebhook(run, { status: 200 })',
    });

    expect(result.ok).toBe(false);
    const r = result.results[0];
    expect(r.ruleId).toBe('golden.webhook.request-payload');
    expect(r.severity).toBe('error');
    expect(r.suggestedFix).toBe('Use hook.token instead of run.');
    expect(r.missing).toContain('hook.token');
    expect(r.forbidden).toContain('resumeWebhook(run, {');
  });

  // --- Skill sequencing validation tests ---

  it('returns ok:true when workflow-design includes stress-before-verify sequencing', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-design.sequencing',
        file: 'skills/workflow-design/SKILL.md',
        mustInclude: [
          'workflow-stress',
          'workflow-verify',
          'hooks, webhooks, sleep, streams, retries, or child workflows',
        ],
        mustAppearInOrder: ['workflow-stress', 'workflow-verify'],
      },
    ];

    const content = `
After generating a blueprint, run workflow-stress before workflow-verify when the design includes hooks, webhooks, sleep, streams, retries, or child workflows.
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-design/SKILL.md': content,
    });

    expect(result.ok).toBe(true);
    expect(result.results[0].status).toBe('pass');
  });

  it('returns ok:false when sequencing terms appear in the wrong order', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-design.sequencing',
        file: 'skills/workflow-design/SKILL.md',
        mustInclude: [
          'workflow-stress',
          'workflow-verify',
          'hooks, webhooks, sleep, streams, retries, or child workflows',
        ],
        mustAppearInOrder: ['workflow-stress', 'workflow-verify'],
      },
    ];

    const content = `
After generating a blueprint, run workflow-verify before workflow-stress when the design includes hooks, webhooks, sleep, streams, retries, or child workflows.
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-design/SKILL.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].outOfOrder).toEqual([
      'workflow-stress',
      'workflow-verify',
    ]);
  });

  it('returns ok:false when workflow-design drops stress-before-verify sequencing', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-design.sequencing',
        file: 'skills/workflow-design/SKILL.md',
        mustInclude: [
          'workflow-stress',
          'workflow-verify',
          'hooks, webhooks, sleep, streams, retries, or child workflows',
        ],
        mustAppearInOrder: ['workflow-stress', 'workflow-verify'],
      },
    ];

    const content = `
After generating a blueprint, run workflow-verify.
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-design/SKILL.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('workflow-stress');
  });

  it('returns ok:true when workflow-verify accepts original or patched blueprint', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-verify.sequencing',
        file: 'skills/workflow-verify/SKILL.md',
        mustInclude: ['original or a stress-patched version'],
      },
    ];

    const content = `
The current workflow blueprint — the original or a stress-patched version, either from the conversation or from files.
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-verify/SKILL.md': content,
    });

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when workflow-verify lacks patched blueprint acceptance', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-verify.sequencing',
        file: 'skills/workflow-verify/SKILL.md',
        mustInclude: ['original or a stress-patched version'],
      },
    ];

    const content = `
The current workflow blueprint from the conversation.
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-verify/SKILL.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain(
      'original or a stress-patched version'
    );
  });

  it('returns ok:true when workflow-teach routes externally-driven to design then stress', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-teach.sequencing',
        file: 'skills/workflow-teach/SKILL.md',
        mustInclude: [
          'workflow-design',
          'workflow-stress',
          'externally-driven workflows',
        ],
        mustAppearInOrder: ['workflow-design', 'workflow-stress'],
      },
    ];

    const content = `
For externally-driven workflows (webhooks, hooks, sleep, child workflows), recommend workflow-design followed immediately by workflow-stress.
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-teach/SKILL.md': content,
    });

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when workflow-teach has stress before design', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-teach.sequencing',
        file: 'skills/workflow-teach/SKILL.md',
        mustInclude: [
          'workflow-design',
          'workflow-stress',
          'externally-driven workflows',
        ],
        mustAppearInOrder: ['workflow-design', 'workflow-stress'],
      },
    ];

    const content = `
For externally-driven workflows, recommend workflow-stress followed by workflow-design.
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-teach/SKILL.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].outOfOrder).toEqual([
      'workflow-design',
      'workflow-stress',
    ]);
  });

  it('returns ok:false when workflow-teach drops stress from externally-driven routing', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-teach.sequencing',
        file: 'skills/workflow-teach/SKILL.md',
        mustInclude: [
          'workflow-design',
          'workflow-stress',
          'externally-driven workflows',
        ],
        mustAppearInOrder: ['workflow-design', 'workflow-stress'],
      },
    ];

    const content = `
For externally-driven workflows, recommend workflow-design.
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-teach/SKILL.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('workflow-stress');
  });

  // --- Stress golden validation tests ---

  it('returns ok:true for valid compensation-saga golden', () => {
    const checks = [
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
    ];

    const content = `
# Golden Scenario: Compensation Saga
compensation idempotency Rollback refundPayment
Retry semantics
Integration test coverage
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-stress/goldens/compensation-saga.md': content,
    });

    expect(result.ok).toBe(true);
    expect(result.results[0].status).toBe('pass');
  });

  it('returns ok:false when compensation-saga golden drops required safeguard text', () => {
    const checks = [
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
    ];

    // Missing 'refundPayment' and 'Rollback'
    const content = `
# Golden Scenario: Compensation Saga
compensation idempotency
Retry semantics
Integration test coverage
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-stress/goldens/compensation-saga.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('fail');
    expect(result.results[0].missing).toContain('Rollback');
    expect(result.results[0].missing).toContain('refundPayment');
  });

  // --- child-workflow-handoff golden tests ---

  it('returns ok:true for valid child-workflow-handoff golden', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
start() runtime step serialization Step granularity
start()\` in workflow context must be wrapped in a step
`
    );

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when child-workflow-handoff drops serialization guidance', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
start() runtime step Step granularity
start()\` in workflow context must be wrapped in a step
`
    );

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('serialization');
  });

  // --- multi-event-hook-loop golden tests ---

  it('returns ok:true for valid multi-event-hook-loop golden', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
AsyncIterable Promise.all resumeHook deterministic
Hook token strategy
Suspension primitive choice
`
    );

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when multi-event-hook-loop drops Promise.all coverage', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
AsyncIterable resumeHook deterministic
Hook token strategy
Suspension primitive choice
`
    );

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('Promise.all');
  });

  // --- rate-limit-retry golden tests ---

  it('returns ok:true for valid rate-limit-retry golden', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
RetryableError FatalError 429 idempotency
Retry semantics
backoff
`
    );

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when rate-limit-retry drops backoff guidance', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
RetryableError FatalError 429 idempotency
Retry semantics
`
    );

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('backoff');
  });

  // --- approval-timeout-streaming golden tests ---

  it('returns ok:true for valid approval-timeout-streaming golden', () => {
    const checks = [
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

    const content = `
# Golden Scenario: Approval Timeout with Streaming
getWritable() stream waitForSleep wakeUp
Determinism boundary
Stream I/O placement
getWritable()\` may be called in workflow context
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-stress/goldens/approval-timeout-streaming.md': content,
    });

    expect(result.ok).toBe(true);
    expect(result.results[0].status).toBe('pass');
  });

  it('returns ok:false when approval-timeout-streaming golden contains forbidden stream wording', () => {
    const checks = [
      {
        ruleId: 'golden.stress.approval-timeout-streaming',
        file: 'skills/workflow-stress/goldens/approval-timeout-streaming.md',
        mustInclude: ['getWritable()', 'stream'],
        mustNotInclude: ['`getWritable()` must be in a step'],
      },
    ];

    const content = `
getWritable() stream
\`getWritable()\` must be in a step
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-stress/goldens/approval-timeout-streaming.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].forbidden).toContain(
      '`getWritable()` must be in a step'
    );
  });

  it('returns ok:false when approval-timeout-streaming reintroduces stale getWritable wording', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
getWritable() stream waitForSleep wakeUp
Determinism boundary
Stream I/O placement
getWritable()\` may be called in workflow context
\`getWritable()\` must be in a step
`
    );

    expect(result.ok).toBe(false);
    expect(result.results[0].forbidden).toContain(
      '`getWritable()` must be in a step'
    );
  });

  it('returns ok:false for missing stress golden file', () => {
    const checks = [
      {
        ruleId: 'golden.stress.rate-limit-retry',
        file: 'skills/workflow-stress/goldens/rate-limit-retry.md',
        mustInclude: ['RetryableError', '429'],
      },
    ];

    const result = validateWorkflowSkillText(checks, {});

    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('error');
    expect(result.results[0].error).toBe('file_not_found');
  });

  it('returns ok:true for valid workflow-stress SKILL.md', () => {
    const checks = [
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
    ];

    const content = `
determinism boundary step granularity serialization issues
idempotency keys Blueprint Patch
getWritable()\` is called in workflow context
seeded workflow-context APIs
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-stress/SKILL.md': content,
    });

    expect(result.ok).toBe(true);
    expect(result.results[0].status).toBe('pass');
  });

  it('returns ok:false when workflow-stress SKILL.md contains forbidden anti-patterns', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-stress',
        file: 'skills/workflow-stress/SKILL.md',
        mustInclude: ['determinism boundary'],
        mustNotInclude: [
          'Are all non-deterministic operations isolated in `"use step"` functions?',
        ],
      },
    ];

    const content = `
determinism boundary
Are all non-deterministic operations isolated in \`"use step"\` functions?
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-stress/SKILL.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].forbidden).toContain(
      'Are all non-deterministic operations isolated in `"use step"` functions?'
    );
  });

  // --- Rule registry smoke tests ---

  it('registers every stress golden rule in the validator manifest', () => {
    expect(stressGoldenChecks.map((check) => check.ruleId)).toEqual([
      'golden.stress.compensation-saga',
      'golden.stress.compensation-saga.schema',
      'golden.stress.child-workflow-handoff',
      'golden.stress.multi-event-hook-loop',
      'golden.stress.rate-limit-retry',
      'golden.stress.approval-timeout-streaming',
    ]);
  });

  it('includes stress golden rules in allChecks', () => {
    const ruleIds = allChecks.map((check) => check.ruleId);

    expect(ruleIds).toContain('golden.stress.compensation-saga');
    expect(ruleIds).toContain('golden.stress.child-workflow-handoff');
    expect(ruleIds).toContain('golden.stress.multi-event-hook-loop');
    expect(ruleIds).toContain('golden.stress.rate-limit-retry');
    expect(ruleIds).toContain('golden.stress.approval-timeout-streaming');
  });

  // --- Anchored order rule tests ---

  it('returns outOfOrder with orderDetails when anchored phrases are reversed', () => {
    const checks = [
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
        suggestedFix:
          'Wait for webhook registration before calling resumeWebhook.',
      },
    ];

    const content = `
await resumeWebhook(hook.token, new Request('https://example.com'));
const hook = await waitForHook(run);
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-design/goldens/webhook-ingress.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('fail');
    expect(result.results[0].outOfOrder).toEqual([
      'const hook = await waitForHook(run);',
      'await resumeWebhook(',
    ]);
    expect(result.results[0].orderDetails).toBeDefined();
    expect(result.results[0].orderDetails.firstInversion.before.value).toBe(
      'const hook = await waitForHook(run);'
    );
    expect(result.results[0].orderDetails.firstInversion.after.value).toBe(
      'await resumeWebhook('
    );
  });

  it('passes when anchored webhook-ingress phrases are correctly ordered', () => {
    const checks = [
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
      },
    ];

    const content = `
const hook = await waitForHook(run);
await resumeWebhook(hook.token, new Request('https://example.com'));
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-design/goldens/webhook-ingress.md': content,
    });

    expect(result.ok).toBe(true);
    expect(result.results[0].status).toBe('pass');
  });

  it('returns outOfOrder when approval-hook-sleep sequence is reversed', () => {
    const checks = [
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
      },
    ];

    const content = `
.wakeUp({ correlationIds: [sleepId] });
await waitForSleep(run);
await resumeHook('approval:doc-123', { approved: true });
await waitForHook(run, { token: 'approval:doc-123' });
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-design/goldens/approval-hook-sleep.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].outOfOrder).toEqual([
      'await waitForHook(run',
      'await resumeHook(',
      'await waitForSleep(run)',
      '.wakeUp(',
    ]);
  });

  it('passes when approval-hook-sleep sequence is correctly ordered', () => {
    const checks = [
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
      },
    ];

    const content = `
await waitForHook(run, { token: 'approval:doc-123' });
await resumeHook('approval:doc-123', { approved: true });
const sleepId = await waitForSleep(run);
await getRun(run.runId).wakeUp({ correlationIds: [sleepId] });
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-design/goldens/approval-hook-sleep.md': content,
    });

    expect(result.ok).toBe(true);
    expect(result.results[0].status).toBe('pass');
  });

  it('returns outOfOrder when workflow-teach anchored phrases are reversed', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-teach.sequencing',
        file: 'skills/workflow-teach/SKILL.md',
        mustInclude: [
          'recommend `workflow-design` followed immediately by',
          '`workflow-stress` to pressure-test the blueprint',
        ],
        mustAppearInOrder: [
          'recommend `workflow-design` followed immediately by',
          '`workflow-stress` to pressure-test the blueprint',
        ],
      },
    ];

    const content = `
\`workflow-stress\` to pressure-test the blueprint before implementation.
For externally-driven workflows, recommend \`workflow-design\` followed immediately by using stress tests.
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-teach/SKILL.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].outOfOrder).toBeDefined();
  });

  it('returns outOfOrder when workflow-design anchored phrases are reversed', () => {
    const checks = [
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
      },
    ];

    const content = `
After generating a blueprint, when the design includes hooks, webhooks, sleep, streams, retries, or child workflows, run \`workflow-stress\` before \`workflow-verify\`.
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-design/SKILL.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].outOfOrder).toEqual([
      'run `workflow-stress` before `workflow-verify`',
      'hooks, webhooks, sleep, streams, retries, or child workflows',
    ]);
  });

  // --- outOfOrder skipped when mustInclude tokens missing ---

  it('does not check order when mustInclude tokens are missing', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-design.sequencing',
        file: 'skills/workflow-design/SKILL.md',
        mustInclude: ['workflow-stress', 'workflow-verify'],
        mustAppearInOrder: ['workflow-stress', 'workflow-verify'],
      },
    ];

    const content = `Only workflow-verify is mentioned here.`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-design/SKILL.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('workflow-stress');
    expect(result.results[0].outOfOrder).toBeUndefined();
  });

  // --- Explicit ordered-pass / ordered-fail / missing-token tests ---

  it('returns outOfOrder with firstInversion when mustAppearInOrder phrases are reversed', () => {
    const checks = [
      {
        ruleId: 'order.reversed',
        file: 'test.md',
        mustInclude: ['workflow-stress', 'workflow-verify'],
        mustAppearInOrder: ['workflow-stress', 'workflow-verify'],
      },
    ];

    const content = `
    Run workflow-verify after blueprint generation.
    Run workflow-stress before release.
    `;

    const result = validateWorkflowSkillText(checks, {
      'test.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('fail');
    expect(result.results[0].outOfOrder).toEqual([
      'workflow-stress',
      'workflow-verify',
    ]);
    expect(result.results[0].orderDetails).toBeDefined();
    expect(result.results[0].orderDetails.expected).toEqual([
      'workflow-stress',
      'workflow-verify',
    ]);
    // firstInversion.before = expected[i-1] that appeared LATER in text
    // firstInversion.after  = expected[i]   that appeared EARLIER in text
    expect(result.results[0].orderDetails.firstInversion.before.value).toBe(
      'workflow-stress'
    );
    expect(result.results[0].orderDetails.firstInversion.after.value).toBe(
      'workflow-verify'
    );
    // The "after" token appeared before the "before" token in the text (inverted)
    expect(
      result.results[0].orderDetails.firstInversion.after.index
    ).toBeLessThan(result.results[0].orderDetails.firstInversion.before.index);
  });

  it('passes when mustAppearInOrder phrases are correctly ordered', () => {
    const checks = [
      {
        ruleId: 'order.correct',
        file: 'test.md',
        mustInclude: ['workflow-stress', 'workflow-verify'],
        mustAppearInOrder: ['workflow-stress', 'workflow-verify'],
      },
    ];

    const content = `
    Run workflow-stress before workflow-verify for complex flows.
    `;

    const result = validateWorkflowSkillText(checks, {
      'test.md': content,
    });

    expect(result.ok).toBe(true);
    expect(result.results[0].status).toBe('pass');
  });

  it('does not emit outOfOrder when a required phrase is missing', () => {
    const checks = [
      {
        ruleId: 'order.missing-token',
        file: 'test.md',
        mustInclude: ['workflow-stress', 'workflow-verify'],
        mustAppearInOrder: ['workflow-stress', 'workflow-verify'],
      },
    ];

    const content = `Run workflow-verify.`;

    const result = validateWorkflowSkillText(checks, {
      'test.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('workflow-stress');
    expect(result.results[0].outOfOrder).toBeUndefined();
    expect(result.results[0].orderDetails).toBeUndefined();
  });

  // --- Teach golden validation tests ---

  it('registers every teach golden rule in the validator manifest', () => {
    expect(teachGoldenChecks.map((check) => check.ruleId)).toEqual([
      'golden.teach.duplicate-webhook-order',
      'golden.teach.approval-expiry-escalation',
      'golden.teach.partial-side-effect-compensation',
      'golden.teach.operator-observability-streams',
    ]);
  });

  it('includes teach golden rules in allChecks', () => {
    const ruleIds = allChecks.map((check) => check.ruleId);

    expect(ruleIds).toContain('golden.teach.duplicate-webhook-order');
    expect(ruleIds).toContain('golden.teach.approval-expiry-escalation');
    expect(ruleIds).toContain('golden.teach.partial-side-effect-compensation');
    expect(ruleIds).toContain('golden.teach.operator-observability-streams');
  });

  it('returns ok:true for valid duplicate-webhook-order golden', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
idempotency businessInvariants idempotencyRequirements
compensationRules observabilityRequirements
duplicate webhook
`
    );

    expect(result.ok).toBe(true);
    expect(result.results[0].status).toBe('pass');
  });

  it('returns ok:false when duplicate-webhook-order golden drops idempotency', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
businessInvariants compensationRules
observabilityRequirements duplicate webhook
`
    );

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('idempotency');
    expect(result.results[0].missing).toContain('idempotencyRequirements');
  });

  it('returns ok:true for valid approval-expiry-escalation golden', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
approvalRules timeoutRules escalation deterministic
hook sleep observabilityRequirements
`
    );

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when approval-expiry-escalation golden drops escalation', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
approvalRules timeoutRules deterministic
hook sleep observabilityRequirements
`
    );

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('escalation');
  });

  it('returns ok:true for valid partial-side-effect-compensation golden', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
compensationRules businessInvariants compensation
rollback idempotencyRequirements observabilityRequirements
`
    );

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when partial-side-effect-compensation golden drops rollback', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
compensationRules businessInvariants compensation
idempotencyRequirements observabilityRequirements
`
    );

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('rollback');
  });

  it('returns ok:true for valid operator-observability-streams golden', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
observabilityRequirements streams getWritable
operatorSignals namespace businessInvariants
`
    );

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when operator-observability-streams golden drops getWritable', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
observabilityRequirements streams
operatorSignals namespace businessInvariants
`
    );

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('getWritable');
  });

  it('returns ok:false for missing teach golden file', () => {
    const check = {
      ruleId: 'golden.teach.duplicate-webhook-order',
      file: 'skills/workflow-teach/goldens/duplicate-webhook-order.md',
      mustInclude: ['idempotency'],
    };

    const result = runSingleCheck(check, undefined);

    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('error');
    expect(result.results[0].error).toBe('file_not_found');
  });

  // --- Downstream check validation tests ---

  it('registers every downstream rule in the validator manifest', () => {
    expect(downstreamChecks.map((check) => check.ruleId)).toEqual([
      'downstream.design.invariants',
      'downstream.design.idempotency-rationale',
      'downstream.stress.idempotency',
      'downstream.stress.compensation',
      'downstream.stress.timeout',
      'downstream.verify.expiry-tests',
      'downstream.design.contractVersion',
      'downstream.teach.contractVersion',
    ]);
  });

  it('includes downstream rules in allChecks', () => {
    const ruleIds = allChecks.map((check) => check.ruleId);

    expect(ruleIds).toContain('downstream.design.invariants');
    expect(ruleIds).toContain('downstream.design.idempotency-rationale');
    expect(ruleIds).toContain('downstream.stress.idempotency');
    expect(ruleIds).toContain('downstream.stress.compensation');
    expect(ruleIds).toContain('downstream.stress.timeout');
    expect(ruleIds).toContain('downstream.verify.expiry-tests');
  });

  it('returns ok:true when workflow-design includes all downstream invariant tokens', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
invariants compensationPlan operatorSignals
businessInvariants compensationRules observabilityRequirements
`
    );

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when workflow-design drops compensationPlan', () => {
    const check = {
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
    };

    const result = runSingleCheck(
      check,
      `
invariants operatorSignals
businessInvariants compensationRules observabilityRequirements
`
    );

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('compensationPlan');
  });

  it('returns ok:true when workflow-stress includes idempotency downstream tokens', () => {
    const check = {
      ruleId: 'downstream.stress.idempotency',
      file: 'skills/workflow-stress/SKILL.md',
      mustInclude: ['idempotency keys', 'idempotency strategy'],
    };

    const result = runSingleCheck(
      check,
      `
Check idempotency keys are derived from stable identifiers.
Does every step have an idempotency strategy?
`
    );

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when workflow-stress drops idempotency strategy', () => {
    const check = {
      ruleId: 'downstream.stress.idempotency',
      file: 'skills/workflow-stress/SKILL.md',
      mustInclude: ['idempotency keys', 'idempotency strategy'],
    };

    const result = runSingleCheck(check, `Check idempotency keys.`);

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('idempotency strategy');
  });

  it('returns ok:true when workflow-stress includes compensation downstream tokens', () => {
    const check = {
      ruleId: 'downstream.stress.compensation',
      file: 'skills/workflow-stress/SKILL.md',
      mustInclude: ['compensation', 'Rollback', 'partial-success'],
    };

    const result = runSingleCheck(
      check,
      `
compensation Rollback
Are partial-success scenarios handled?
`
    );

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when workflow-stress drops Rollback', () => {
    const check = {
      ruleId: 'downstream.stress.compensation',
      file: 'skills/workflow-stress/SKILL.md',
      mustInclude: ['compensation', 'Rollback', 'partial-success'],
    };

    const result = runSingleCheck(
      check,
      `compensation and partial-success handling`
    );

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('Rollback');
  });

  it('returns ok:true when workflow-verify includes expiry test helpers', () => {
    const check = {
      ruleId: 'downstream.verify.expiry-tests',
      file: 'skills/workflow-verify/SKILL.md',
      mustInclude: ['waitForSleep', 'wakeUp', 'resumeHook'],
    };

    const result = runSingleCheck(
      check,
      `
Use waitForSleep() and wakeUp() for timeouts.
Use resumeHook() for approval flows.
`
    );

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when workflow-verify drops wakeUp', () => {
    const check = {
      ruleId: 'downstream.verify.expiry-tests',
      file: 'skills/workflow-verify/SKILL.md',
      mustInclude: ['waitForSleep', 'wakeUp', 'resumeHook'],
    };

    const result = runSingleCheck(
      check,
      `
Use waitForSleep() for timeouts.
Use resumeHook() for approval flows.
`
    );

    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('wakeUp');
  });

  it('returns ok:true when workflow-verify maps policy arrays inside Test Matrix', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-verify.contract-fields',
        file: 'skills/workflow-verify/SKILL.md',
        sectionHeading: '### `## Test Matrix`',
        mustIncludeWithinSection: [
          'invariants',
          'compensationPlan',
          'operatorSignals',
          'failure-path',
          'stream/log',
        ],
      },
    ];

    const content = `
### \`## Test Matrix\`

- invariants
- compensationPlan
- operatorSignals
- failure-path
- stream/log

### \`## Integration Test Skeleton\`
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-verify/SKILL.md': content,
    });

    expect(result.ok).toBe(true);
  });

  it('returns section-specific diagnostics when workflow-verify mentions tokens outside Test Matrix only', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-verify.contract-fields',
        file: 'skills/workflow-verify/SKILL.md',
        sectionHeading: '### `## Test Matrix`',
        mustIncludeWithinSection: [
          'invariants',
          'compensationPlan',
          'operatorSignals',
          'failure-path',
          'stream/log',
        ],
      },
    ];

    const content = `
invariants compensationPlan operatorSignals failure-path stream/log

### \`## Test Matrix\`

Tests for hooks only.

### \`## Integration Test Skeleton\`
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-verify/SKILL.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].sectionHeading).toBe('### `## Test Matrix`');
    expect(result.results[0].missingSectionTokens).toEqual(
      expect.arrayContaining([
        'invariants',
        'compensationPlan',
        'operatorSignals',
      ])
    );
  });

  it('returns ok:false when workflow-verify has no Test Matrix section at all', () => {
    const checks = [
      {
        ruleId: 'skill.workflow-verify.contract-fields',
        file: 'skills/workflow-verify/SKILL.md',
        sectionHeading: '### `## Test Matrix`',
        mustIncludeWithinSection: [
          'invariants',
          'compensationPlan',
          'operatorSignals',
          'failure-path',
          'stream/log',
        ],
      },
    ];

    const content = `
The verification step should create tests for hooks, webhooks, and sleeps.
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-verify/SKILL.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].missingSectionTokens).toEqual(
      expect.arrayContaining([
        'invariants',
        'compensationPlan',
        'operatorSignals',
      ])
    );
  });

  // --- JSON fence validation tests ---

  it('returns ok:true when compensation-saga golden keeps required WorkflowBlueprint arrays', () => {
    const checks = [
      {
        ruleId: 'golden.stress.compensation-saga.schema',
        file: 'skills/workflow-stress/goldens/compensation-saga.md',
        jsonFence: {
          language: 'json',
          requiredKeys: ['invariants', 'compensationPlan', 'operatorSignals'],
        },
      },
    ];

    const content = `
# Golden Scenario: Compensation Saga

\`\`\`json
{
  "name": "order-fulfillment",
  "invariants": [],
  "compensationPlan": [],
  "operatorSignals": []
}
\`\`\`
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-stress/goldens/compensation-saga.md': content,
    });

    expect(result.ok).toBe(true);
  });

  it('returns structured jsonFence diagnostics when compensation-saga golden is invalid JSON', () => {
    const checks = [
      {
        ruleId: 'golden.stress.compensation-saga.schema',
        file: 'skills/workflow-stress/goldens/compensation-saga.md',
        jsonFence: {
          language: 'json',
          requiredKeys: ['invariants', 'compensationPlan', 'operatorSignals'],
        },
      },
    ];

    const content = `
# Golden Scenario: Compensation Saga

\`\`\`json
{ "name": "order-fulfillment", }
\`\`\`
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-stress/goldens/compensation-saga.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('structured_validation_failed');
    expect(result.results[0].jsonFenceError).toBe('invalid_json');
  });

  it('returns missingJsonKeys when compensation-saga golden omits required keys', () => {
    const checks = [
      {
        ruleId: 'golden.stress.compensation-saga.schema',
        file: 'skills/workflow-stress/goldens/compensation-saga.md',
        jsonFence: {
          language: 'json',
          requiredKeys: ['invariants', 'compensationPlan', 'operatorSignals'],
        },
      },
    ];

    const content = `
# Golden Scenario: Compensation Saga

\`\`\`json
{
  "name": "order-fulfillment",
  "antiPatternsAvoided": []
}
\`\`\`
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-stress/goldens/compensation-saga.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('structured_validation_failed');
    expect(result.results[0].missingJsonKeys).toEqual(
      expect.arrayContaining([
        'invariants',
        'compensationPlan',
        'operatorSignals',
      ])
    );
  });

  // --- forbiddenContext diagnostic tests ---

  it('includes forbiddenContext excerpts for forbidden-token failures', () => {
    const checks = [
      {
        ruleId: 'golden.webhook-ingress',
        file: 'skills/workflow-design/goldens/webhook-ingress.md',
        mustNotInclude: ['resumeWebhook(run, {'],
      },
    ];

    const content = `
Some preamble text here.
await resumeWebhook(run, { status: 200, body: {} });
Some trailing text here.
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-design/goldens/webhook-ingress.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('forbidden_content_present');
    expect(result.results[0].forbiddenContext).toBeDefined();
    expect(
      result.results[0].forbiddenContext['resumeWebhook(run, {']
    ).toContain('resumeWebhook(run, {');
  });

  it('emits reason field for missing_required_content failures', () => {
    const checks = [
      {
        ruleId: 'test.reason',
        file: 'test.md',
        mustInclude: ['foo'],
      },
    ];

    const result = validateWorkflowSkillText(checks, {
      'test.md': 'bar baz',
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('missing_required_content');
  });

  it('emits reason field for content_out_of_order failures', () => {
    const checks = [
      {
        ruleId: 'test.order',
        file: 'test.md',
        mustInclude: ['alpha', 'beta'],
        mustAppearInOrder: ['alpha', 'beta'],
      },
    ];

    const result = validateWorkflowSkillText(checks, {
      'test.md': 'beta comes before alpha here',
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('content_out_of_order');
  });

  it('emits reason structured_validation_failed for section-only failures', () => {
    const checks = [
      {
        ruleId: 'test.section',
        file: 'test.md',
        sectionHeading: '## Target',
        mustIncludeWithinSection: ['required-token'],
      },
    ];

    const content = `
required-token appears above the section

## Target

Nothing relevant here.

## Next
`;

    const result = validateWorkflowSkillText(checks, {
      'test.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('structured_validation_failed');
    expect(result.results[0].missingSectionTokens).toContain('required-token');
  });

  it('returns missing_code_fence when compensation-saga golden has no JSON fence', () => {
    const checks = [
      {
        ruleId: 'golden.stress.compensation-saga.schema',
        file: 'skills/workflow-stress/goldens/compensation-saga.md',
        jsonFence: {
          language: 'json',
          requiredKeys: ['invariants', 'compensationPlan', 'operatorSignals'],
        },
      },
    ];

    const content = `
# Golden Scenario: Compensation Saga

No code fence here, just plain text about invariants.
`;

    const result = validateWorkflowSkillText(checks, {
      'skills/workflow-stress/goldens/compensation-saga.md': content,
    });

    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('structured_validation_failed');
    expect(result.results[0].jsonFenceError).toBe('missing_code_fence');
  });

  // --- skill.workflow-teach.loop-position tests ---

  it('returns ok:true when workflow-teach declares Stage 1 of 4 with workflow-design after stage marker', () => {
    const check = checks.find(
      (c) => c.ruleId === 'skill.workflow-teach.loop-position'
    );

    const content = `
## Skill Loop Position

Stage 1 of 4 in the teach → design → stress → verify loop.

After gathering context, hand off to workflow-design for blueprint generation.
`;

    const result = runSingleCheck(check, content);

    expect(result.ok).toBe(true);
    expect(result.results[0].status).toBe('pass');
    expect(result.results[0].ruleId).toBe('skill.workflow-teach.loop-position');
  });

  it('returns ok:false when workflow-teach is missing Stage 1 of 4', () => {
    const check = checks.find(
      (c) => c.ruleId === 'skill.workflow-teach.loop-position'
    );

    const content = `
## Skill Loop Position

This is a teach skill in the teach → design → stress → verify loop.

After gathering context, hand off to workflow-design for blueprint generation.
`;

    const result = runSingleCheck(check, content);

    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('fail');
    expect(result.results[0].ruleId).toBe('skill.workflow-teach.loop-position');
    expect(result.results[0].missing).toContain('Stage 1 of 4');
  });

  it('returns ok:false when workflow-design appears before stage marker in teach loop-position', () => {
    const check = checks.find(
      (c) => c.ruleId === 'skill.workflow-teach.loop-position'
    );

    const content = `
## Skill Loop Position

Hand off to workflow-design first.

Stage 1 of 4 in the teach → design → stress → verify loop.
`;

    const result = runSingleCheck(check, content);

    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('fail');
    expect(result.results[0].ruleId).toBe('skill.workflow-teach.loop-position');
    expect(result.results[0].outOfOrder).toEqual([
      'Stage 1 of 4',
      'workflow-design',
    ]);
  });

  it('includes skill.workflow-teach.loop-position in allChecks', () => {
    const ruleIds = allChecks.map((c) => c.ruleId);
    expect(ruleIds).toContain('skill.workflow-teach.loop-position');
  });

  // --- contractVersion negative validation tests ---

  it('returns ok:false when teach context JSON omits contractVersion', () => {
    const check = {
      ruleId: 'golden.hero.teach.contractVersion',
      file: 'skills/workflow-teach/goldens/approval-expiry-escalation.md',
      jsonFence: {
        language: 'json',
        requiredKeys: ['contractVersion'],
      },
      suggestedFix:
        'Teach context JSON must include contractVersion for schema compatibility.',
    };

    const content = `
# Golden: Approval Expiry Escalation

\`\`\`json
{
  "projectName": "po-approval",
  "productGoal": "Route PO approvals with escalation"
}
\`\`\`
`;

    const result = runSingleCheck(check, content);

    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('structured_validation_failed');
    expect(result.results[0].missingJsonKeys).toContain('contractVersion');
  });

  it('returns ok:true when teach context JSON includes contractVersion', () => {
    const check = {
      ruleId: 'golden.hero.teach.contractVersion',
      file: 'skills/workflow-teach/goldens/approval-expiry-escalation.md',
      jsonFence: {
        language: 'json',
        requiredKeys: ['contractVersion'],
      },
    };

    const content = `
# Golden: Approval Expiry Escalation

\`\`\`json
{
  "contractVersion": "1",
  "projectName": "po-approval"
}
\`\`\`
`;

    const result = runSingleCheck(check, content);

    expect(result.ok).toBe(true);
  });

  it('returns ok:false when design blueprint JSON omits contractVersion', () => {
    const check = heroGoldenChecks.find(
      (c) => c.ruleId === 'golden.hero.design.blueprint-schema'
    );

    const content = `
# Golden: Approval Expiry Escalation Blueprint

\`\`\`json
{
  "name": "po-approval",
  "invariants": [],
  "compensationPlan": [],
  "operatorSignals": [],
  "steps": [],
  "suspensions": [],
  "tests": []
}
\`\`\`
`;

    const result = runSingleCheck(check, content);

    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('structured_validation_failed');
    expect(result.results[0].missingJsonKeys).toContain('contractVersion');
  });

  it('returns ok:true when design blueprint JSON includes contractVersion', () => {
    const check = heroGoldenChecks.find(
      (c) => c.ruleId === 'golden.hero.design.blueprint-schema'
    );

    const content = `
# Golden: Approval Expiry Escalation Blueprint

\`\`\`json
{
  "contractVersion": "1",
  "name": "po-approval",
  "invariants": [],
  "compensationPlan": [],
  "operatorSignals": [],
  "steps": [],
  "suspensions": [],
  "tests": []
}
\`\`\`
`;

    const result = runSingleCheck(check, content);

    expect(result.ok).toBe(true);
  });

  it('returns ok:false for downstream.teach.contractVersion when contractVersion is missing', () => {
    const check = downstreamChecks.find(
      (c) => c.ruleId === 'downstream.teach.contractVersion'
    );

    const result = runSingleCheck(
      check,
      `
Gather context about the workflow project.
Save to .workflow-skills/context.json.
`
    );

    expect(result.ok).toBe(false);
    expect(result.results[0].ruleId).toBe('downstream.teach.contractVersion');
    expect(result.results[0].missing).toContain('contractVersion');
  });

  it('returns ok:true for downstream.teach.contractVersion when contractVersion is present', () => {
    const check = downstreamChecks.find(
      (c) => c.ruleId === 'downstream.teach.contractVersion'
    );

    const result = runSingleCheck(
      check,
      `
Gather context about the workflow project.
Include contractVersion in the emitted context.json.
`
    );

    expect(result.ok).toBe(true);
    expect(result.results[0].ruleId).toBe('downstream.teach.contractVersion');
  });

  it('returns ok:false for downstream.design.contractVersion when contractVersion is missing', () => {
    const check = downstreamChecks.find(
      (c) => c.ruleId === 'downstream.design.contractVersion'
    );

    const result = runSingleCheck(
      check,
      `
Generate a WorkflowBlueprint with steps and suspensions.
`
    );

    expect(result.ok).toBe(false);
    expect(result.results[0].ruleId).toBe('downstream.design.contractVersion');
    expect(result.results[0].missing).toContain('contractVersion');
  });

  it('returns ok:true for downstream.design.contractVersion when contractVersion is present', () => {
    const check = downstreamChecks.find(
      (c) => c.ruleId === 'downstream.design.contractVersion'
    );

    const result = runSingleCheck(
      check,
      `
Generate a WorkflowBlueprint with contractVersion for backward compatibility.
`
    );

    expect(result.ok).toBe(true);
    expect(result.results[0].ruleId).toBe('downstream.design.contractVersion');
  });
});
