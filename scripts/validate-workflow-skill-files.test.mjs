import { describe, it, expect } from 'vitest';
import { validateWorkflowSkillText } from './lib/validate-workflow-skill-files.mjs';

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
});
