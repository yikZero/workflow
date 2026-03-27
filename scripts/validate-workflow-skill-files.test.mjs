import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateWorkflowSkillText } from './lib/validate-workflow-skill-files.mjs';
import {
  checks,
  allGoldenChecks,
  teachChecks,
  buildChecks,
  teachGoldenChecks,
  buildGoldenChecks,
} from './lib/workflow-skill-checks.mjs';

function runSingleCheck(check, content) {
  return validateWorkflowSkillText([check], {
    [check.file]: content,
  });
}

// ---------------------------------------------------------------------------
// Validator engine tests
// ---------------------------------------------------------------------------

describe('validateWorkflowSkillText', () => {
  it('returns ok:true when all required tokens are present', () => {
    const result = runSingleCheck(
      { ruleId: 'test', file: 'test.md', mustInclude: ['foo', 'bar'] },
      'foo bar baz'
    );
    expect(result.ok).toBe(true);
  });

  it('returns ok:false when required tokens are missing', () => {
    const result = runSingleCheck(
      { ruleId: 'test', file: 'test.md', mustInclude: ['foo', 'missing'] },
      'foo bar baz'
    );
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('missing_required_content');
    expect(result.results[0].missing).toContain('missing');
  });

  it('returns ok:false when forbidden tokens are present', () => {
    const result = runSingleCheck(
      { ruleId: 'test', file: 'test.md', mustNotInclude: ['bad'] },
      'something bad here'
    );
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('forbidden_content_present');
    expect(result.results[0].forbidden).toContain('bad');
  });

  it('includes forbiddenContext excerpts for forbidden-token failures', () => {
    const result = runSingleCheck(
      { ruleId: 'test', file: 'test.md', mustNotInclude: ['bad token'] },
      'some text before bad token some text after'
    );
    expect(result.ok).toBe(false);
    expect(result.results[0].forbiddenContext).toBeDefined();
    expect(result.results[0].forbiddenContext['bad token']).toContain(
      'bad token'
    );
  });

  it('returns ok:false when tokens appear out of order', () => {
    const result = runSingleCheck(
      {
        ruleId: 'test',
        file: 'test.md',
        mustInclude: ['alpha', 'beta'],
        mustAppearInOrder: ['alpha', 'beta'],
      },
      'beta comes before alpha here'
    );
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('content_out_of_order');
  });

  it('returns ok:true when tokens appear in order', () => {
    const result = runSingleCheck(
      {
        ruleId: 'test',
        file: 'test.md',
        mustInclude: ['alpha', 'beta'],
        mustAppearInOrder: ['alpha', 'beta'],
      },
      'alpha comes before beta here'
    );
    expect(result.ok).toBe(true);
  });

  it('returns error when file is not found', () => {
    const result = validateWorkflowSkillText(
      [{ ruleId: 'test', file: 'missing.md', mustInclude: ['foo'] }],
      {}
    );
    expect(result.ok).toBe(false);
    expect(result.results[0].status).toBe('error');
    expect(result.results[0].error).toBe('file_not_found');
  });
});

// ---------------------------------------------------------------------------
// workflow-teach SKILL.md checks
// ---------------------------------------------------------------------------

describe('workflow-teach SKILL.md validation', () => {
  it('requires .workflow.md output reference', () => {
    const check = teachChecks.find((c) => c.ruleId === 'skill.workflow-teach');
    const result = runSingleCheck(
      check,
      'Some skill that outputs context.json and does not mention the markdown file'
    );
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('.workflow.md');
  });

  it('rejects stale context.json references', () => {
    const check = teachChecks.find((c) => c.ruleId === 'skill.workflow-teach');
    const content = [
      '.workflow.md',
      '## Project Context',
      '## Business Rules',
      '## External Systems',
      '## Failure Expectations',
      '## Observability Needs',
      '## Approved Patterns',
      '## Open Questions',
      '.workflow-skills/context.json',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].forbidden).toContain(
      '.workflow-skills/context.json'
    );
  });

  it('requires all 7 interview questions', () => {
    const check = teachChecks.find(
      (c) => c.ruleId === 'skill.workflow-teach.interview'
    );
    const result = runSingleCheck(check, 'Empty skill with no interview');
    expect(result.ok).toBe(false);
    expect(result.results[0].missing.length).toBe(7);
  });

  it('requires Stage 1 of 2 loop position', () => {
    const check = teachChecks.find(
      (c) => c.ruleId === 'skill.workflow-teach.loop-position'
    );
    const result = runSingleCheck(check, 'Stage 1 of 4 workflow-design');
    expect(result.ok).toBe(false);
    expect(result.results[0].forbidden).toContain('Stage 1 of 4');
  });

  it('rejects references to deleted skills', () => {
    const check = teachChecks.find(
      (c) => c.ruleId === 'skill.workflow-teach.loop-position'
    );
    const result = runSingleCheck(
      check,
      'Stage 1 of 2 workflow-build workflow-design'
    );
    expect(result.ok).toBe(false);
    expect(result.results[0].forbidden).toContain('workflow-design');
  });
});

// ---------------------------------------------------------------------------
// workflow-build SKILL.md checks
// ---------------------------------------------------------------------------

describe('workflow-build SKILL.md validation', () => {
  it('requires .workflow.md input reference', () => {
    const check = buildChecks.find((c) => c.ruleId === 'skill.workflow-build');
    const result = runSingleCheck(check, 'A skill that reads nothing');
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('.workflow.md');
  });

  it('rejects stale WorkflowBlueprint references', () => {
    const check = buildChecks.find((c) => c.ruleId === 'skill.workflow-build');
    const allRequired = check.mustInclude.join('\n');
    const result = runSingleCheck(check, allRequired + '\nWorkflowBlueprint');
    expect(result.ok).toBe(false);
    expect(result.results[0].forbidden).toContain('WorkflowBlueprint');
  });

  it('requires all 12 stress checklist items', () => {
    const check = buildChecks.find(
      (c) => c.ruleId === 'skill.workflow-build.stress-checklist'
    );
    const result = runSingleCheck(
      check,
      '### 1. Determinism boundary\n### 2. Step granularity'
    );
    expect(result.ok).toBe(false);
    expect(result.results[0].missing.length).toBe(10); // 12 - 2 present
  });

  it('requires interactive phases in order', () => {
    const check = buildChecks.find(
      (c) => c.ruleId === 'skill.workflow-build.interactive-phases'
    );
    const content = [
      'Phase 5',
      'Phase 4',
      'Phase 3',
      'Phase 2',
      'Phase 1',
      'Propose step boundaries',
      'Flag relevant traps',
      'Decide failure modes',
      'Write code',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('content_out_of_order');
  });

  it('passes when phases are in correct order', () => {
    const check = buildChecks.find(
      (c) => c.ruleId === 'skill.workflow-build.interactive-phases'
    );
    const content = [
      'Phase 1',
      'Propose step boundaries',
      'Phase 2',
      'Flag relevant traps',
      'Phase 3',
      'Decide failure modes',
      'Phase 4',
      'Write code',
      'Phase 5',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(true);
  });

  it('requires Stage 2 of 2 loop position', () => {
    const check = buildChecks.find(
      (c) => c.ruleId === 'skill.workflow-build.loop-position'
    );
    const result = runSingleCheck(check, 'Stage 2 of 4');
    expect(result.ok).toBe(false);
    expect(result.results[0].forbidden).toContain('Stage 2 of 4');
  });
});

// ---------------------------------------------------------------------------
// Teach golden checks
// ---------------------------------------------------------------------------

describe('teach golden validation', () => {
  it('requires .workflow.md sections in teach goldens', () => {
    const check = teachGoldenChecks.find(
      (c) => c.ruleId === 'golden.teach.approval-expiry-escalation'
    );
    const result = runSingleCheck(check, '## Interview Context\nSome content');
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain(
      '## Expected `.workflow.md` Sections'
    );
  });

  it('rejects teach goldens referencing context.json', () => {
    const check = teachGoldenChecks.find(
      (c) => c.ruleId === 'golden.teach.approval-expiry-escalation'
    );
    const content = [
      '## Interview Context',
      '## Expected `.workflow.md` Sections',
      '### Business Rules',
      '### Failure Expectations',
      '### Observability Needs',
      'workflow-build',
      'context.json',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].forbidden).toContain('context.json');
  });

  it('rejects teach goldens referencing deleted skills', () => {
    const check = teachGoldenChecks.find(
      (c) => c.ruleId === 'golden.teach.approval-expiry-escalation'
    );
    const content = [
      '## Interview Context',
      '## Expected `.workflow.md` Sections',
      '### Business Rules',
      '### Failure Expectations',
      '### Observability Needs',
      'workflow-build',
      'workflow-design',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].forbidden).toContain('workflow-design');
  });

  it('passes valid teach golden', () => {
    const check = teachGoldenChecks.find(
      (c) => c.ruleId === 'golden.teach.duplicate-webhook-order'
    );
    const content = [
      '## Interview Context',
      '## Expected `.workflow.md` Sections',
      '### Business Rules',
      'idempotency key',
      'workflow-build is the next step',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Build golden checks
// ---------------------------------------------------------------------------

describe('build golden validation', () => {
  it('requires phase documentation in build goldens', () => {
    const check = buildGoldenChecks.find(
      (c) => c.ruleId === 'golden.build.compensation-saga'
    );
    const result = runSingleCheck(check, '## Expected Code Output\n"use step"');
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain(
      '## What the Build Skill Should Catch'
    );
  });

  it('requires code output in build goldens', () => {
    const check = buildGoldenChecks.find(
      (c) => c.ruleId === 'golden.build.compensation-saga'
    );
    const result = runSingleCheck(
      check,
      '## What the Build Skill Should Catch\n### Phase 2\n### Phase 3'
    );
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('## Expected Code Output');
  });

  it('requires test output in streaming golden', () => {
    const check = buildGoldenChecks.find(
      (c) => c.ruleId === 'golden.build.approval-timeout-streaming'
    );
    const content = [
      '## What the Build Skill Should Catch',
      '### Phase 2',
      '## Expected Code Output',
      'getWritable',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('## Expected Test Output');
  });

  it('requires specific API tokens in streaming golden', () => {
    const check = buildGoldenChecks.find(
      (c) => c.ruleId === 'golden.build.approval-timeout-streaming'
    );
    const content = [
      '## What the Build Skill Should Catch',
      '### Phase 2',
      '## Expected Code Output',
      '## Expected Test Output',
      'getWritable',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    // Should require test helpers
    expect(result.results[0].missing).toEqual(
      expect.arrayContaining([
        'waitForHook',
        'resumeHook',
        'waitForSleep',
        'wakeUp',
      ])
    );
  });

  it('requires Promise.all in multi-event-hook-loop golden', () => {
    const check = buildGoldenChecks.find(
      (c) => c.ruleId === 'golden.build.multi-event-hook-loop'
    );
    const content = [
      '## What the Build Skill Should Catch',
      '### Phase 2',
      '## Expected Code Output',
      '## Expected Test Output',
      'createHook',
      'deterministic token',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('Promise.all');
  });
});

// ---------------------------------------------------------------------------
// Verification artifact schema checks
// ---------------------------------------------------------------------------

describe('verification artifact schema enforcement', () => {
  const compensationCheck = buildGoldenChecks.find(
    (c) => c.ruleId === 'golden.build.compensation-saga'
  );

  it('fails with structured_validation_failed when testMatrix is missing from JSON', () => {
    const content = [
      '## What the Build Skill Should Catch',
      '### Phase 2',
      '### Phase 3',
      '## Expected Code Output',
      '"use step"',
      'compensation',
      'idempotency',
      'refund',
      '## Verification Artifact',
      '',
      '```json',
      JSON.stringify({
        contractVersion: '1',
        blueprintName: 'compensation-saga',
        files: [{ kind: 'workflow', path: 'workflows/order-fulfillment.ts' }],
        runtimeCommands: [{ name: 'test', command: 'pnpm test', expects: 'pass' }],
        implementationNotes: ['some note'],
      }),
      '```',
      '',
      '### Verification Summary',
      '',
      '{"event":"verification_plan_ready","blueprintName":"compensation-saga","fileCount":1,"testCount":0,"runtimeCommandCount":1,"contractVersion":"1"}',
    ].join('\n');
    const result = runSingleCheck(compensationCheck, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('structured_validation_failed');
    expect(result.results[0].missingJsonKeys).toContain('testMatrix');
  });

  it('fails when testMatrix is present but empty', () => {
    const content = [
      '## What the Build Skill Should Catch',
      '### Phase 2',
      '### Phase 3',
      '## Expected Code Output',
      '"use step"',
      'compensation',
      'idempotency',
      'refund',
      '## Verification Artifact',
      '',
      '```json',
      JSON.stringify({
        contractVersion: '1',
        blueprintName: 'compensation-saga',
        files: [{ kind: 'workflow', path: 'workflows/order-fulfillment.ts' }],
        testMatrix: [],
        runtimeCommands: [{ name: 'test', command: 'pnpm test', expects: 'pass' }],
        implementationNotes: ['some note'],
      }),
      '```',
      '',
      '### Verification Summary',
      '',
      '{"event":"verification_plan_ready","blueprintName":"compensation-saga","fileCount":1,"testCount":0,"runtimeCommandCount":1,"contractVersion":"1"}',
    ].join('\n');
    const result = runSingleCheck(compensationCheck, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('structured_validation_failed');
    expect(result.results[0].emptyJsonKeys).toContain('testMatrix');
  });

  it('fails when verification_plan_ready summary line is missing', () => {
    const content = [
      '## What the Build Skill Should Catch',
      '### Phase 2',
      '### Phase 3',
      '## Expected Code Output',
      '"use step"',
      'compensation',
      'idempotency',
      'refund',
      '## Verification Artifact',
      '',
      '```json',
      JSON.stringify({
        contractVersion: '1',
        blueprintName: 'compensation-saga',
        files: [{ kind: 'workflow', path: 'workflows/order-fulfillment.ts' }],
        testMatrix: [{ name: 'happy-path', helpers: [], expects: 'pass' }],
        runtimeCommands: [{ name: 'test', command: 'pnpm test', expects: 'pass' }],
        implementationNotes: ['some note'],
      }),
      '```',
      '',
      '### Verification Summary',
      '',
      'No summary here',
    ].join('\n');
    const result = runSingleCheck(compensationCheck, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('verification_plan_ready');
  });

  it('passes when all schema requirements are met', () => {
    const content = [
      '## What the Build Skill Should Catch',
      '### Phase 2',
      '### Phase 3',
      '## Expected Code Output',
      '"use step"',
      'compensation',
      'idempotency',
      'refund',
      '## Verification Artifact',
      '',
      '```json',
      JSON.stringify({
        contractVersion: '1',
        blueprintName: 'compensation-saga',
        files: [{ kind: 'workflow', path: 'workflows/order-fulfillment.ts' }],
        testMatrix: [{ name: 'happy-path', helpers: [], expects: 'pass' }],
        runtimeCommands: [{ name: 'test', command: 'pnpm test', expects: 'pass' }],
        implementationNotes: ['Operator signal: log compensation.triggered'],
      }),
      '```',
      '',
      '### Verification Summary',
      '',
      '{"event":"verification_plan_ready","blueprintName":"compensation-saga","fileCount":1,"testCount":1,"runtimeCommandCount":1,"contractVersion":"1"}',
    ].join('\n');
    const result = runSingleCheck(compensationCheck, content);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Regression: stale 4-stage pipeline references
// ---------------------------------------------------------------------------

describe('stale reference regression', () => {
  it('teach skill must not reference workflow-design', () => {
    const check = teachChecks.find(
      (c) => c.ruleId === 'skill.workflow-teach.loop-position'
    );
    expect(check.mustNotInclude).toContain('workflow-design');
    expect(check.mustNotInclude).toContain('workflow-stress');
    expect(check.mustNotInclude).toContain('workflow-verify');
  });

  it('build skill must not reference WorkflowBlueprint', () => {
    const check = buildChecks.find((c) => c.ruleId === 'skill.workflow-build');
    expect(check.mustNotInclude).toContain('WorkflowBlueprint');
    expect(check.mustNotInclude).toContain('.workflow-skills/context.json');
  });

  it('teach goldens must not reference context.json', () => {
    for (const check of teachGoldenChecks) {
      expect(check.mustNotInclude).toContain('context.json');
    }
  });
});

// ---------------------------------------------------------------------------
// Live validation against actual files
// ---------------------------------------------------------------------------

describe('live validation against actual skill files', () => {
  const allChecksFlat = [...checks, ...allGoldenChecks];

  const filesByPath = {};
  for (const check of allChecksFlat) {
    if (filesByPath[check.file]) continue;
    try {
      filesByPath[check.file] = readFileSync(check.file, 'utf8');
    } catch {
      // File not found — the validator will catch this
    }
  }

  it('all skill checks pass against actual files', () => {
    const result = validateWorkflowSkillText(checks, filesByPath);
    for (const item of result.results) {
      if (item.status !== 'pass') {
        throw new Error(
          `Rule ${item.ruleId} failed: ${JSON.stringify(item, null, 2)}`
        );
      }
    }
    expect(result.ok).toBe(true);
  });

  it('all golden checks pass against actual files', () => {
    const result = validateWorkflowSkillText(allGoldenChecks, filesByPath);
    for (const item of result.results) {
      if (item.status !== 'pass') {
        throw new Error(
          `Rule ${item.ruleId} failed: ${JSON.stringify(item, null, 2)}`
        );
      }
    }
    expect(result.ok).toBe(true);
  });

  it('total check count is 17', () => {
    expect(allChecksFlat.length).toBe(17);
  });
});
