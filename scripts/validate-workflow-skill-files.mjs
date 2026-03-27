import { readFileSync, existsSync } from 'node:fs';
import { validateWorkflowSkillText } from './lib/validate-workflow-skill-files.mjs';

const checks = [
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
];

const goldenChecks = [
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

const allChecks = [...checks, ...goldenChecks];

// Read all files into a map
const filesByPath = {};
for (const check of allChecks) {
  if (existsSync(check.file)) {
    filesByPath[check.file] = readFileSync(check.file, 'utf8');
  }
}

const result = validateWorkflowSkillText(allChecks, filesByPath);

if (!result.ok) {
  const errors = result.results.filter((r) => r.status !== 'pass');
  console.error(
    JSON.stringify({ ok: false, checked: result.checked, errors }, null, 2)
  );
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
