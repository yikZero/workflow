import { describe, it, expect } from 'vitest';
import { validateWorkflowSkillText } from './lib/validate-workflow-skill-files.mjs';
import {
  allChecks,
  stressGoldenChecks,
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
        mustInclude: ['createWebhook', 'resumeWebhook', 'hook.token', 'new Request('],
        mustNotInclude: ['resumeWebhook(run, {'],
        suggestedFix: 'Use waitForHook(run) to obtain hook.token, then call resumeWebhook(hook.token, new Request(...)).',
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
        mustInclude: ['createWebhook', 'resumeWebhook', 'hook.token', 'new Request(', 'JSON.stringify('],
        mustNotInclude: ['resumeWebhook(run, {', "resumeWebhook('webhook-token', {"],
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
      'skills/workflow-design/goldens/human-in-the-loop-streaming.md': badContent,
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
    expect(result.results[0].missing).toContain('original or a stress-patched version');
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
    expect(result.results[0].forbidden).toContain('`getWritable()` must be in a step');
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
    expect(result.results[0].forbidden).toContain('`getWritable()` must be in a step');
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
});
