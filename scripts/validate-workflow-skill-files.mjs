import { readFileSync, existsSync } from 'node:fs';

const checks = [
  {
    file: 'skills/workflow-teach/SKILL.md',
    mustInclude: [
      '.workflow-skills/context.json',
      'projectName',
      'productGoal',
      'triggerSurfaces',
      'externalSystems',
      'antiPatterns',
      'canonicalExamples',
    ],
  },
  {
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
    ],
  },
  {
    file: 'skills/workflow-stress/SKILL.md',
    mustInclude: [
      'determinism boundary',
      'step granularity',
      'serialization issues',
      'idempotency keys',
      'Blueprint Patch',
    ],
  },
  {
    file: 'skills/workflow-verify/SKILL.md',
    mustInclude: [
      'waitForHook()',
      'resumeHook()',
      'resumeWebhook()',
      'waitForSleep()',
      'wakeUp',
      'run.returnValue',
    ],
  },
];

const goldenChecks = [
  {
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
    file: 'skills/workflow-design/goldens/webhook-ingress.md',
    mustInclude: [
      'createWebhook',
      'resumeWebhook',
      'waitForHook',
      'antiPatternsAvoided',
      'webhook',
    ],
  },
  {
    file: 'skills/workflow-design/goldens/human-in-the-loop-streaming.md',
    mustInclude: [
      'createHook',
      'getWritable',
      'stream',
      'resumeHook',
      'waitForHook',
      'antiPatternsAvoided',
    ],
  },
];

const allChecks = [...checks, ...goldenChecks];
const results = [];
let failed = false;

for (const check of allChecks) {
  if (!existsSync(check.file)) {
    failed = true;
    results.push({
      file: check.file,
      status: 'error',
      error: 'file_not_found',
    });
    continue;
  }

  const text = readFileSync(check.file, 'utf8');
  const missing = check.mustInclude.filter((value) => !text.includes(value));

  if (missing.length > 0) {
    failed = true;
    results.push({ file: check.file, status: 'fail', missing });
  } else {
    results.push({ file: check.file, status: 'pass' });
  }
}

if (failed) {
  const errors = results.filter((r) => r.status !== 'pass');
  console.error(
    JSON.stringify({ ok: false, checked: allChecks.length, errors }, null, 2)
  );
  process.exit(1);
}

console.log(
  JSON.stringify({ ok: true, checked: allChecks.length, results }, null, 2)
);
