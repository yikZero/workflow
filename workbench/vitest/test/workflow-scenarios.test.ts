/**
 * Workflow Scenario Skills Smoke Tests
 *
 * Validates that each scenario skill SKILL.md correctly routes through the
 * teach/design/stress/verify loop and mentions its required patterns.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKFLOW_SCENARIOS } from '../../../lib/ai/workflow-scenarios';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

function readSkill(scenarioName: string): string {
  const path = resolve(ROOT, 'skills', scenarioName, 'SKILL.md');
  return readFileSync(path, 'utf-8');
}

function readGolden(scenarioName: string, goldenName: string): string {
  const path = resolve(
    ROOT,
    'skills',
    scenarioName,
    'goldens',
    `${goldenName}.md`
  );
  return readFileSync(path, 'utf-8');
}

function extractJsonFence(text: string): Record<string, unknown> | null {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === '```json');
  if (start === -1) return null;
  const end = lines.findIndex((l, i) => i > start && l.trim() === '```');
  if (end === -1) return null;
  try {
    return JSON.parse(lines.slice(start + 1, end).join('\n'));
  } catch {
    return null;
  }
}

const FULL_LOOP = [
  'workflow-teach',
  'workflow-design',
  'workflow-stress',
  'workflow-verify',
] as const;

describe('workflow scenario skills', () => {
  describe('workflow-approval', () => {
    const content = readSkill('workflow-approval');

    it('routes to teach/design/stress/verify and mentions hook + sleep', () => {
      for (const stage of FULL_LOOP) {
        expect(content).toContain(stage);
      }
      expect(content).toContain('hook');
      expect(content).toContain('sleep');
    });

    it('has user-invocable frontmatter', () => {
      expect(content).toContain('user-invocable: true');
      expect(content).toContain('argument-hint:');
    });

    it('golden contains valid blueprint with required fields', () => {
      const golden = readGolden(
        'workflow-approval',
        'approval-expiry-escalation'
      );
      const blueprint = extractJsonFence(golden);
      expect(blueprint).not.toBeNull();
      expect(blueprint!.contractVersion).toBe('1');
      expect(blueprint!.name).toBe('approval-expiry-escalation');
      expect(blueprint!.invariants).toBeDefined();
      expect(blueprint!.compensationPlan).toBeDefined();
      expect(blueprint!.operatorSignals).toBeDefined();
    });
  });

  describe('workflow-webhook', () => {
    const content = readSkill('workflow-webhook');

    it('mentions duplicate delivery and idempotency', () => {
      for (const stage of FULL_LOOP) {
        expect(content).toContain(stage);
      }
      expect(content).toContain('duplicate delivery');
      expect(content).toContain('idempotency');
    });

    it('golden contains valid blueprint', () => {
      const golden = readGolden('workflow-webhook', 'webhook-ingress');
      const blueprint = extractJsonFence(golden);
      expect(blueprint).not.toBeNull();
      expect(blueprint!.contractVersion).toBe('1');
      expect(blueprint!.invariants).toBeDefined();
      expect(blueprint!.compensationPlan).toBeDefined();
    });
  });

  describe('workflow-saga', () => {
    const content = readSkill('workflow-saga');

    it('mentions compensation for partial success', () => {
      for (const stage of FULL_LOOP) {
        expect(content).toContain(stage);
      }
      expect(content).toContain('compensation');
      expect(content).toContain('partial');
    });

    it('golden contains compensation plan', () => {
      const golden = readGolden('workflow-saga', 'compensation-saga');
      const blueprint = extractJsonFence(golden);
      expect(blueprint).not.toBeNull();
      expect(
        (blueprint!.compensationPlan as string[]).length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe('workflow-timeout', () => {
    const content = readSkill('workflow-timeout');

    it('mentions waitForSleep/wakeUp coverage', () => {
      for (const stage of FULL_LOOP) {
        expect(content).toContain(stage);
      }
      expect(content).toContain('waitForSleep');
      expect(content).toContain('wakeUp');
    });

    it('golden contains sleep suspensions', () => {
      const golden = readGolden(
        'workflow-timeout',
        'approval-timeout-streaming'
      );
      const blueprint = extractJsonFence(golden);
      expect(blueprint).not.toBeNull();
      const suspensions = blueprint!.suspensions as Array<{ kind: string }>;
      expect(suspensions.some((s) => s.kind === 'sleep')).toBe(true);
    });
  });

  describe('workflow-idempotency', () => {
    const content = readSkill('workflow-idempotency');

    it('mentions duplicate and retry safety', () => {
      for (const stage of FULL_LOOP) {
        expect(content).toContain(stage);
      }
      expect(content).toContain('duplicate');
      expect(content).toContain('retry');
      expect(content).toContain('idempotency');
    });

    it('golden contains idempotency keys on steps', () => {
      const golden = readGolden(
        'workflow-idempotency',
        'duplicate-webhook-order'
      );
      const blueprint = extractJsonFence(golden);
      expect(blueprint).not.toBeNull();
      const steps = blueprint!.steps as Array<{
        idempotencyKey?: string;
        sideEffects: string[];
        runtime: string;
      }>;
      const stepsWithSideEffects = steps.filter(
        (s) => s.runtime === 'step' && s.sideEffects.length > 0
      );
      for (const step of stepsWithSideEffects) {
        expect(step.idempotencyKey).toBeDefined();
      }
    });
  });

  describe('workflow-observe', () => {
    const content = readSkill('workflow-observe');

    it('mentions operatorSignals and stream/log assertions', () => {
      for (const stage of FULL_LOOP) {
        expect(content).toContain(stage);
      }
      expect(content).toContain('operatorSignals');
      expect(content).toContain('stream');
      expect(content).toContain('namespace');
    });

    it('golden contains stream namespaces', () => {
      const golden = readGolden(
        'workflow-observe',
        'operator-observability-streams'
      );
      const blueprint = extractJsonFence(golden);
      expect(blueprint).not.toBeNull();
      const streams = blueprint!.streams as Array<{
        namespace: string | null;
      }>;
      expect(streams.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('scenario registry coherence', () => {
    const scenarios = [
      { name: 'workflow-approval', blueprint: 'approval-expiry-escalation' },
      { name: 'workflow-webhook', blueprint: 'webhook-ingress' },
      { name: 'workflow-saga', blueprint: 'compensation-saga' },
      { name: 'workflow-timeout', blueprint: 'approval-timeout-streaming' },
      { name: 'workflow-idempotency', blueprint: 'duplicate-webhook-order' },
      { name: 'workflow-observe', blueprint: 'operator-observability-streams' },
    ];

    it('every scenario skill has a SKILL.md', () => {
      for (const s of scenarios) {
        const path = resolve(ROOT, 'skills', s.name, 'SKILL.md');
        expect(existsSync(path), `missing ${s.name}/SKILL.md`).toBe(true);
      }
    });

    it('every scenario skill has a goldens directory', () => {
      for (const s of scenarios) {
        const path = resolve(ROOT, 'skills', s.name, 'goldens');
        expect(existsSync(path), `missing ${s.name}/goldens/`).toBe(true);
      }
    });

    it('every scenario skill invokes the full teach/design/stress/verify loop', () => {
      for (const s of scenarios) {
        const content = readSkill(s.name);
        for (const stage of FULL_LOOP) {
          expect(content).toContain(stage);
        }
      }
    });

    it('every scenario golden uses registry blueprintName as the canonical name', () => {
      for (const scenario of WORKFLOW_SCENARIOS) {
        const goldenPath = resolve(
          ROOT,
          'skills',
          scenario.name,
          'goldens',
          `${scenario.blueprintName}.md`
        );
        expect(
          existsSync(goldenPath),
          `missing canonical golden ${scenario.blueprintName} for ${scenario.name}`
        ).toBe(true);
      }
    });
  });
});
