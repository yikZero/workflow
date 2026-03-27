/**
 * Hero Loop Smoke Test: Approval-Expiry-Escalation
 *
 * Proves the full workflow-skills loop (teach → design → stress → verify)
 * produces coherent, contract-valid artifacts for one end-to-end hero scenario.
 *
 * Each assertion records which critical guarantee it covers:
 *   idempotency | timeout | compensation | observability | runtime-helpers
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

function readGolden(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf-8');
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

function extractAllJsonFences(text: string): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim() === '```json') {
      const end = lines.findIndex((l, j) => j > i && l.trim() === '```');
      if (end === -1) break;
      try {
        results.push(
          JSON.parse(lines.slice(i + 1, end).join('\n')) as Record<
            string,
            unknown
          >
        );
      } catch {
        // skip invalid fences
      }
      i = end + 1;
    } else {
      i++;
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Load hero scenario goldens
// ---------------------------------------------------------------------------

const teachContent = readGolden(
  'skills/workflow-teach/goldens/approval-expiry-escalation.md'
);
const designContent = readGolden(
  'skills/workflow-design/goldens/approval-expiry-escalation.md'
);
const stressContent = readGolden(
  'skills/workflow-stress/goldens/approval-expiry-escalation.md'
);
const verifyContent = readGolden(
  'skills/workflow-verify/goldens/approval-expiry-escalation.md'
);

// ---------------------------------------------------------------------------
// Required runtime helpers that must appear across the loop
// ---------------------------------------------------------------------------

const REQUIRED_HELPERS = [
  'start',
  'getRun',
  'waitForHook',
  'resumeHook',
  'waitForSleep',
  'wakeUp',
  'run.returnValue',
] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('hero-loop: approval-expiry-escalation', () => {
  // -----------------------------------------------------------------------
  // 1. Teach golden captures domain context
  // -----------------------------------------------------------------------
  describe('teach stage', () => {
    it('captures both approval actors with deterministic tokens [idempotency]', () => {
      expect(teachContent).toContain('approval:po-${poNumber}');
      expect(teachContent).toContain('escalation:po-${poNumber}');
    });

    it('surfaces timeout rules for both approval windows [timeout]', () => {
      expect(teachContent).toContain('48 hours');
      expect(teachContent).toContain('24 hours');
      const ctx = extractJsonFence(teachContent);
      expect(ctx).not.toBeNull();
      const timeoutRules = (ctx as Record<string, unknown>).timeoutRules;
      expect(Array.isArray(timeoutRules)).toBe(true);
      expect((timeoutRules as string[]).length).toBeGreaterThanOrEqual(2);
    });

    it('documents observability requirements for full lifecycle [observability]', () => {
      const ctx = extractJsonFence(teachContent);
      expect(ctx).not.toBeNull();
      const obs = (ctx as Record<string, unknown>)
        .observabilityRequirements as string[];
      expect(Array.isArray(obs)).toBe(true);
      expect(obs.some((s) => s.includes('requested'))).toBe(true);
      expect(obs.some((s) => s.includes('escalated'))).toBe(true);
      expect(obs.some((s) => s.includes('decided'))).toBe(true);
    });

    it('records compensation is empty for read-only approval [compensation]', () => {
      const ctx = extractJsonFence(teachContent);
      expect(ctx).not.toBeNull();
      const comp = (ctx as Record<string, unknown>)
        .compensationRules as string[];
      expect(Array.isArray(comp)).toBe(true);
      expect(comp).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Design golden produces a contract-valid blueprint
  // -----------------------------------------------------------------------
  describe('design stage', () => {
    const blueprint = extractJsonFence(designContent);

    it('emits a valid WorkflowBlueprint with contractVersion [runtime-helpers]', () => {
      expect(blueprint).not.toBeNull();
      expect(blueprint!.contractVersion).toBe('1');
      expect(blueprint!.name).toBe('approval-expiry-escalation');
    });

    it('includes all required runtime helpers in test plans [runtime-helpers]', () => {
      const tests = blueprint!.tests as Array<{
        helpers: string[];
      }>;
      const allHelpers = new Set(tests.flatMap((t) => t.helpers));
      for (const helper of [
        'start',
        'waitForHook',
        'resumeHook',
        'waitForSleep',
        'wakeUp',
      ]) {
        expect(allHelpers.has(helper)).toBe(true);
      }
    });

    it('contains run.returnValue in test skeleton [runtime-helpers]', () => {
      expect(designContent).toContain('run.returnValue');
    });

    it('pairs every approval hook with a timeout sleep [timeout]', () => {
      const suspensions = blueprint!.suspensions as Array<{
        kind: string;
        duration?: string;
      }>;
      const hooks = suspensions.filter((s) => s.kind === 'hook');
      const sleeps = suspensions.filter((s) => s.kind === 'sleep');
      expect(hooks.length).toBeGreaterThanOrEqual(2);
      expect(sleeps.length).toBeGreaterThanOrEqual(2);
      expect(sleeps.some((s) => s.duration === '48h')).toBe(true);
      expect(sleeps.some((s) => s.duration === '24h')).toBe(true);
    });

    it('assigns idempotencyKey to every step with side effects [idempotency]', () => {
      const steps = blueprint!.steps as Array<{
        sideEffects: string[];
        idempotencyKey?: string;
        runtime: string;
      }>;
      const stepsWithSideEffects = steps.filter(
        (s) => s.runtime === 'step' && s.sideEffects.length > 0
      );
      for (const step of stepsWithSideEffects) {
        expect(step.idempotencyKey).toBeDefined();
        expect(step.idempotencyKey!.length).toBeGreaterThan(0);
      }
    });

    it('populates invariants with single-decision and escalation-ordering rules [idempotency]', () => {
      const invariants = blueprint!.invariants as string[];
      expect(invariants.length).toBeGreaterThanOrEqual(2);
      expect(invariants.some((i) => i.includes('one final decision'))).toBe(
        true
      );
      expect(invariants.some((i) => i.includes('Escalation'))).toBe(true);
    });

    it('populates operatorSignals for full approval lifecycle [observability]', () => {
      const signals = blueprint!.operatorSignals as string[];
      expect(signals.length).toBeGreaterThanOrEqual(3);
      expect(signals.some((s) => s.includes('requested'))).toBe(true);
      expect(signals.some((s) => s.includes('escalated'))).toBe(true);
      expect(signals.some((s) => s.includes('decided'))).toBe(true);
    });

    it('compensation plan is empty for approval workflow [compensation]', () => {
      const comp = blueprint!.compensationPlan as string[];
      expect(Array.isArray(comp)).toBe(true);
      expect(comp).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Stress golden catches missing guarantees in defective blueprint
  // -----------------------------------------------------------------------
  describe('stress stage', () => {
    it('flags missing idempotency keys as critical fix [idempotency]', () => {
      expect(stressContent).toContain('Idempotency keys');
      expect(stressContent).toContain('idempotencyKey');
    });

    it('flags missing escalation path as critical fix [timeout]', () => {
      expect(stressContent).toContain('Missing escalation path');
      expect(stressContent).toContain('escalation:po-${poNumber}');
    });

    it('flags missing timeout suspensions as critical fix [timeout]', () => {
      expect(stressContent).toContain('Missing timeout suspensions');
      expect(stressContent).toContain('48h');
      expect(stressContent).toContain('24h');
    });

    it('requires test coverage for escalation and auto-rejection paths [runtime-helpers]', () => {
      expect(stressContent).toContain('Integration test coverage');
      expect(stressContent).toContain('waitForSleep');
      expect(stressContent).toContain('wakeUp');
      expect(stressContent).toContain('resumeHook');
    });

    it('flags observability gaps in operator signals [observability]', () => {
      expect(stressContent).toContain('Operator observability gaps');
      expect(stressContent).toContain('approval.escalated');
      expect(stressContent).toContain('approval.decided');
    });

    it('produces a corrected Blueprint Patch with all policy arrays [compensation]', () => {
      const fences = extractAllJsonFences(stressContent);
      // Last fence should be the patched blueprint
      const patch = fences[fences.length - 1];
      expect(patch).toBeDefined();
      expect(patch.invariants).toBeDefined();
      expect(patch.compensationPlan).toBeDefined();
      expect(patch.operatorSignals).toBeDefined();
      expect((patch.operatorSignals as string[]).length).toBeGreaterThanOrEqual(
        3
      );
    });
  });

  // -----------------------------------------------------------------------
  // 4. Verify golden produces implementation-ready verification artifacts
  // -----------------------------------------------------------------------
  describe('verify stage', () => {
    it('includes Files to Create section [runtime-helpers]', () => {
      expect(verifyContent).toContain('## Files to Create');
    });

    it('includes Test Matrix section [runtime-helpers]', () => {
      expect(verifyContent).toContain('## Test Matrix');
    });

    it('includes Integration Test Skeleton section [runtime-helpers]', () => {
      expect(verifyContent).toContain('## Integration Test Skeleton');
    });

    it('includes Runtime Verification Commands section [runtime-helpers]', () => {
      expect(verifyContent).toContain('## Runtime Verification Commands');
    });

    it('covers all required runtime helpers in test skeleton [runtime-helpers]', () => {
      for (const helper of REQUIRED_HELPERS) {
        expect(verifyContent).toContain(helper);
      }
    });

    it('carries blueprint invariants into verification work [idempotency]', () => {
      expect(verifyContent).toContain('one final decision');
      expect(verifyContent).toContain('Escalation must only trigger after');
    });

    it('carries compensationPlan into verification work [compensation]', () => {
      expect(verifyContent).toContain('compensationPlan');
      expect(verifyContent).toContain('read-only');
    });

    it('carries operatorSignals into verification work [observability]', () => {
      expect(verifyContent).toContain('approval.requested');
      expect(verifyContent).toContain('approval.escalated');
      expect(verifyContent).toContain('approval.decided');
    });

    it('includes Verification Artifact section [runtime-helpers]', () => {
      expect(verifyContent).toContain('## Verification Artifact');
    });

    it('persists a verification artifact path [runtime-helpers]', () => {
      expect(verifyContent).toContain(
        '.workflow-skills/verification/approval-expiry-escalation.json'
      );
    });
  });

  // -----------------------------------------------------------------------
  // 5. Cross-stage coherence: the loop produces a consistent hero path
  // -----------------------------------------------------------------------
  describe('cross-stage coherence', () => {
    it('all required runtime helpers appear across the design golden [runtime-helpers]', () => {
      for (const helper of REQUIRED_HELPERS) {
        expect(designContent).toContain(helper);
      }
    });

    it('teach context fields propagate into design blueprint policy arrays', () => {
      const teachCtx = extractJsonFence(teachContent) as Record<
        string,
        unknown
      >;
      const designBlueprint = extractJsonFence(designContent) as Record<
        string,
        unknown
      >;

      // Teach businessInvariants → design invariants
      expect(
        (teachCtx.businessInvariants as string[]).length
      ).toBeGreaterThanOrEqual(1);
      expect(
        (designBlueprint.invariants as string[]).length
      ).toBeGreaterThanOrEqual(1);

      // Teach observabilityRequirements → design operatorSignals
      expect(
        (teachCtx.observabilityRequirements as string[]).length
      ).toBeGreaterThanOrEqual(1);
      expect(
        (designBlueprint.operatorSignals as string[]).length
      ).toBeGreaterThanOrEqual(1);
    });

    it('stress Blueprint Patch fixes all defects found in defective input', () => {
      const fences = extractAllJsonFences(stressContent);
      const defective = fences[0];
      const patched = fences[fences.length - 1];

      // Defective: missing idempotency keys on steps
      const defectiveSteps = defective.steps as Array<{
        idempotencyKey?: string;
        sideEffects: string[];
        runtime: string;
      }>;
      const missingKeys = defectiveSteps.filter(
        (s) =>
          s.runtime === 'step' && s.sideEffects.length > 0 && !s.idempotencyKey
      );
      expect(missingKeys.length).toBeGreaterThan(0);

      // Patched: all side-effect steps have keys
      const patchedSteps = patched.steps as Array<{
        idempotencyKey?: string;
        sideEffects: string[];
        runtime: string;
      }>;
      const stillMissing = patchedSteps.filter(
        (s) =>
          s.runtime === 'step' && s.sideEffects.length > 0 && !s.idempotencyKey
      );
      expect(stillMissing).toHaveLength(0);
    });

    it('scenario name is consistent across all four stages', () => {
      expect(teachContent).toContain('Approval Expiry Escalation');
      expect(designContent).toContain('Approval Expiry Escalation');
      expect(stressContent).toContain('Approval Expiry Escalation');
      expect(verifyContent).toContain('Approval Expiry Escalation');
    });
  });
});
