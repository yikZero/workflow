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
  approvalChecks,
  webhookChecks,
  approvalGoldenChecks,
  webhookGoldenChecks,
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
// Regression: extractSection must stop at sibling headings
// ---------------------------------------------------------------------------

describe('extractSection scoping', () => {
  it('fails when a required token exists only after the target section ends', () => {
    // "testMatrix" appears under "## Other Section", NOT under "## Verification Artifact"
    const content = [
      '## Verification Artifact',
      '',
      '```json',
      '{"contractVersion":"1"}',
      '```',
      '',
      '## Other Section',
      '',
      'testMatrix appears here but should not count',
    ].join('\n');

    const check = {
      ruleId: 'test.section-scope',
      file: 'test.md',
      sectionHeading: '## Verification Artifact',
      mustIncludeWithinSection: ['testMatrix'],
    };

    const result = validateWorkflowSkillText([check], { 'test.md': content });
    expect(result.ok).toBe(false);
    expect(result.results[0].missingSectionTokens).toContain('testMatrix');
  });

  it('passes when the required token is inside the target section', () => {
    const content = [
      '## Verification Artifact',
      '',
      'testMatrix is right here',
      '',
      '## Other Section',
      '',
      'unrelated content',
    ].join('\n');

    const check = {
      ruleId: 'test.section-scope',
      file: 'test.md',
      sectionHeading: '## Verification Artifact',
      mustIncludeWithinSection: ['testMatrix'],
    };

    const result = validateWorkflowSkillText([check], { 'test.md': content });
    expect(result.ok).toBe(true);
  });

  it('subsection headings do not terminate the parent section', () => {
    const content = [
      '## Verification Artifact',
      '',
      '### Verification Summary',
      '',
      'testMatrix lives in a subsection',
      '',
      '## Next Top-Level Section',
    ].join('\n');

    const check = {
      ruleId: 'test.section-scope',
      file: 'test.md',
      sectionHeading: '## Verification Artifact',
      mustIncludeWithinSection: ['testMatrix'],
    };

    const result = validateWorkflowSkillText([check], { 'test.md': content });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario skill checks: workflow-approval
// ---------------------------------------------------------------------------

describe('workflow-approval SKILL.md validation', () => {
  it('fails when user-invocable frontmatter is missing', () => {
    const check = approvalChecks.find(
      (c) => c.ruleId === 'skill.workflow-approval'
    );
    const content = [
      'argument-hint: describe the approval',
      '.workflow.md',
      'approval',
      'createHook',
      'sleep',
      'escalation',
      'deterministic',
      'verification_plan_ready',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('missing_required_content');
    expect(result.results[0].missing).toContain('user-invocable: true');
  });

  it('fails when Promise.race constraint is missing', () => {
    const check = approvalChecks.find(
      (c) => c.ruleId === 'skill.workflow-approval.required-constraints'
    );
    const content = [
      'Deterministic hook tokens',
      'Expiry via `sleep()`',
      'Escalation behavior',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('missing_required_content');
    expect(result.results[0].missing).toContain('Promise.race');
  });

  it('fails when context-capture questions are missing', () => {
    const check = approvalChecks.find(
      (c) => c.ruleId === 'skill.workflow-approval.context-capture'
    );
    const result = runSingleCheck(check, 'some unrelated content');
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('Approval actors');
    expect(result.results[0].missing).toContain('Timeout/expiry rules');
    expect(result.results[0].missing).toContain('Hook token strategy');
  });

  it('fails when test-coverage helpers are missing', () => {
    const check = approvalChecks.find(
      (c) => c.ruleId === 'skill.workflow-approval.test-coverage'
    );
    const result = runSingleCheck(check, 'waitForHook only');
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('resumeHook');
    expect(result.results[0].missing).toContain('waitForSleep');
    expect(result.results[0].missing).toContain('wakeUp');
  });

  it('passes when all required tokens are present', () => {
    const check = approvalChecks.find(
      (c) => c.ruleId === 'skill.workflow-approval'
    );
    const content = [
      'user-invocable: true',
      'argument-hint: describe the approval',
      '.workflow.md',
      'approval',
      'createHook',
      'sleep',
      'escalation',
      'deterministic',
      'verification_plan_ready',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scenario skill checks: workflow-webhook
// ---------------------------------------------------------------------------

describe('workflow-webhook SKILL.md validation', () => {
  it('fails when static and manual response modes are missing', () => {
    const check = webhookChecks.find(
      (c) => c.ruleId === 'skill.workflow-webhook.required-constraints'
    );
    const content = [
      'Duplicate-delivery handling',
      'Stable idempotency keys',
      'Webhook response mode',
      'Compensation when downstream steps fail',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('missing_required_content');
    expect(result.results[0].missing).toContain('static');
    expect(result.results[0].missing).toContain('manual');
  });

  it('fails when user-invocable frontmatter is missing', () => {
    const check = webhookChecks.find(
      (c) => c.ruleId === 'skill.workflow-webhook'
    );
    const content = [
      'argument-hint: describe the webhook',
      '.workflow.md',
      'webhook',
      'duplicate',
      'idempotency',
      'verification_plan_ready',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('missing_required_content');
    expect(result.results[0].missing).toContain('user-invocable: true');
  });

  it('fails when context-capture questions are missing', () => {
    const check = webhookChecks.find(
      (c) => c.ruleId === 'skill.workflow-webhook.context-capture'
    );
    const result = runSingleCheck(check, 'some unrelated content');
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('Webhook source');
    expect(result.results[0].missing).toContain('Duplicate handling');
    expect(result.results[0].missing).toContain('Idempotency strategy');
    expect(result.results[0].missing).toContain('Response timeout');
    expect(result.results[0].missing).toContain('Compensation requirements');
  });

  it('fails when test-coverage scenarios are missing', () => {
    const check = webhookChecks.find(
      (c) => c.ruleId === 'skill.workflow-webhook.test-coverage'
    );
    const result = runSingleCheck(check, 'Happy path only');
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('Duplicate webhook');
    expect(result.results[0].missing).toContain('Compensation path');
  });

  it('passes when all required tokens are present', () => {
    const check = webhookChecks.find(
      (c) => c.ruleId === 'skill.workflow-webhook'
    );
    const content = [
      'user-invocable: true',
      'argument-hint: describe the webhook',
      '.workflow.md',
      'webhook',
      'duplicate',
      'idempotency',
      'verification_plan_ready',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Approval golden checks
// ---------------------------------------------------------------------------

describe('approval golden validation', () => {
  it('fails when verification artifact JSON keys are missing', () => {
    const check = approvalGoldenChecks.find(
      (c) => c.ruleId === 'golden.approval.approval-expiry-escalation'
    );
    const content = [
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
      '',
      '```json',
      JSON.stringify({
        contractVersion: '1',
        blueprintName: 'approval-expiry-escalation',
      }),
      '```',
      '',
      '### Verification Summary',
      '',
      '{"event":"verification_plan_ready","blueprintName":"approval-expiry-escalation","fileCount":1,"testCount":1,"runtimeCommandCount":1,"contractVersion":"1"}',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('structured_validation_failed');
    expect(result.results[0].missingJsonKeys).toContain('files');
    expect(result.results[0].missingJsonKeys).toContain('testMatrix');
    expect(result.results[0].missingJsonKeys).toContain('runtimeCommands');
    expect(result.results[0].missingJsonKeys).toContain('implementationNotes');
  });

  it('fails when verification_plan_ready summary is missing', () => {
    const check = approvalGoldenChecks.find(
      (c) => c.ruleId === 'golden.approval.approval-expiry-escalation'
    );
    const content = [
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
      '',
      '```json',
      JSON.stringify({
        contractVersion: '1',
        blueprintName: 'approval-expiry-escalation',
        files: [{ kind: 'workflow', path: 'workflows/approval.ts' }],
        testMatrix: [{ name: 'happy-path', helpers: [], expects: 'pass' }],
        runtimeCommands: [{ name: 'test', command: 'pnpm test', expects: 'pass' }],
        implementationNotes: ['deterministic hook tokens'],
      }),
      '```',
      '',
      '### Verification Summary',
      '',
      'No summary here',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('verification_plan_ready');
  });

  it('passes when all approval golden requirements are met', () => {
    const check = approvalGoldenChecks.find(
      (c) => c.ruleId === 'golden.approval.approval-expiry-escalation'
    );
    const content = [
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
      '',
      '```json',
      JSON.stringify({
        contractVersion: '1',
        blueprintName: 'approval-expiry-escalation',
        files: [{ kind: 'workflow', path: 'workflows/approval.ts' }],
        testMatrix: [{ name: 'happy-path', helpers: [], expects: 'pass' }],
        runtimeCommands: [{ name: 'test', command: 'pnpm test', expects: 'pass' }],
        implementationNotes: ['deterministic hook tokens'],
      }),
      '```',
      '',
      '### Verification Summary',
      '',
      '{"event":"verification_plan_ready","blueprintName":"approval-expiry-escalation","fileCount":1,"testCount":1,"runtimeCommandCount":1,"contractVersion":"1"}',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Webhook golden checks
// ---------------------------------------------------------------------------

describe('webhook golden validation', () => {
  it('fails when verification_plan_ready summary contract is missing', () => {
    const check = webhookGoldenChecks.find(
      (c) => c.ruleId === 'golden.webhook.duplicate-webhook-order'
    );
    const content = [
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
      '',
      '```json',
      JSON.stringify({
        contractVersion: '1',
        blueprintName: 'duplicate-webhook-order',
        files: [{ kind: 'workflow', path: 'workflows/webhook.ts' }],
        testMatrix: [{ name: 'happy-path', helpers: [], expects: 'pass' }],
        runtimeCommands: [{ name: 'test', command: 'pnpm test', expects: 'pass' }],
        implementationNotes: ['stable idempotency keys'],
      }),
      '```',
      '',
      '### Verification Summary',
      '',
      'No structured summary here',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].missing).toContain('verification_plan_ready');
  });

  it('fails when verification artifact JSON keys are missing', () => {
    const check = webhookGoldenChecks.find(
      (c) => c.ruleId === 'golden.webhook.duplicate-webhook-order'
    );
    const content = [
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
      '',
      '```json',
      JSON.stringify({
        contractVersion: '1',
        blueprintName: 'duplicate-webhook-order',
      }),
      '```',
      '',
      '### Verification Summary',
      '',
      '{"event":"verification_plan_ready","blueprintName":"duplicate-webhook-order","fileCount":1,"testCount":1,"runtimeCommandCount":1,"contractVersion":"1"}',
    ].join('\n');
    const result = runSingleCheck(check, content);
    expect(result.ok).toBe(false);
    expect(result.results[0].reason).toBe('structured_validation_failed');
    expect(result.results[0].missingJsonKeys).toContain('files');
    expect(result.results[0].missingJsonKeys).toContain('testMatrix');
  });

  it('passes when all webhook golden requirements are met', () => {
    const check = webhookGoldenChecks.find(
      (c) => c.ruleId === 'golden.webhook.duplicate-webhook-order'
    );
    const content = [
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
      '',
      '```json',
      JSON.stringify({
        contractVersion: '1',
        blueprintName: 'duplicate-webhook-order',
        files: [{ kind: 'workflow', path: 'workflows/webhook.ts' }],
        testMatrix: [{ name: 'happy-path', helpers: [], expects: 'pass' }],
        runtimeCommands: [{ name: 'test', command: 'pnpm test', expects: 'pass' }],
        implementationNotes: ['stable idempotency keys'],
      }),
      '```',
      '',
      '### Verification Summary',
      '',
      '{"event":"verification_plan_ready","blueprintName":"duplicate-webhook-order","fileCount":1,"testCount":1,"runtimeCommandCount":1,"contractVersion":"1"}',
    ].join('\n');
    const result = runSingleCheck(check, content);
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

  it('total check count is 27', () => {
    expect(allChecksFlat.length).toBe(27);
  });
});
