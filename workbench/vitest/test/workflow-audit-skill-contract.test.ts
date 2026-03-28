import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

describe('workflow-audit skill contract', () => {
  const text = readFileSync(
    resolve(ROOT, 'skills/workflow-audit/SKILL.md'),
    'utf8',
  );

  it('keeps the scored-report contract intact', () => {
    expect(text).toContain('## Audit Scorecard');
    expect(text).toContain('## Executive Summary');
    expect(text).toContain('## Detailed Findings by Severity');
    expect(text).toContain('## Systemic Risks');
    expect(text).toContain('## Positive Findings');
    expect(text).toContain('## Audit Summary');
    expect(text).toContain('P0 Blocking');
    expect(text).toContain('P1 Major');
    expect(text).toContain('P2 Minor');
    expect(text).toContain('P3 Polish');
    expect(text).toContain('"event":"workflow_audit_complete"');
    expect(text).toContain('"maxScore":48');
    expect(text).toContain('"contractVersion":"1"');
  });

  it('reuses the same 12-check durable-workflow rubric as workflow-build', () => {
    for (const token of [
      'Determinism boundary',
      'Step granularity',
      'Pass-by-value / serialization',
      'Hook token strategy',
      'Webhook response mode',
      '`start()` placement',
      'Stream I/O placement',
      'Idempotency keys',
      'Retry semantics',
      'Rollback / compensation',
      'Observability streams',
      'Integration test coverage',
    ]) {
      expect(text).toContain(token);
    }
  });
});
