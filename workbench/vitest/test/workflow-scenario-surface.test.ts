import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

describe('workflow scenario surface', () => {
  // -----------------------------------------------------------------------
  // Scenario skill files exist
  // -----------------------------------------------------------------------
  describe('scenario skills exist', () => {
    it('workflow-approval SKILL.md exists', () => {
      expect(
        existsSync(resolve(ROOT, 'skills/workflow-approval/SKILL.md')),
      ).toBe(true);
    });

    it('workflow-webhook SKILL.md exists', () => {
      expect(
        existsSync(resolve(ROOT, 'skills/workflow-webhook/SKILL.md')),
      ).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Frontmatter: user-invocable and argument-hint
  // -----------------------------------------------------------------------
  describe('scenario skill frontmatter', () => {
    it('workflow-approval has user-invocable: true and argument-hint', () => {
      const skill = read('skills/workflow-approval/SKILL.md');
      expect(skill).toContain('user-invocable: true');
      expect(skill).toContain('argument-hint:');
    });

    it('workflow-webhook has user-invocable: true and argument-hint', () => {
      const skill = read('skills/workflow-webhook/SKILL.md');
      expect(skill).toContain('user-invocable: true');
      expect(skill).toContain('argument-hint:');
    });
  });

  // -----------------------------------------------------------------------
  // Context reuse: .workflow.md when present, fallback to capture
  // -----------------------------------------------------------------------
  describe('context reuse contract', () => {
    it('workflow-approval reuses .workflow.md and falls back to context capture', () => {
      const skill = read('skills/workflow-approval/SKILL.md');
      expect(skill).toContain('.workflow.md');
      expect(skill).toContain('Context Capture');
    });

    it('workflow-webhook reuses .workflow.md and falls back to context capture', () => {
      const skill = read('skills/workflow-webhook/SKILL.md');
      expect(skill).toContain('.workflow.md');
      expect(skill).toContain('Context Capture');
    });
  });

  // -----------------------------------------------------------------------
  // Verification contract: same as workflow-build
  // -----------------------------------------------------------------------
  describe('verification contract parity with workflow-build', () => {
    it('workflow-approval terminates with verification_plan_ready', () => {
      const skill = read('skills/workflow-approval/SKILL.md');
      expect(skill).toContain('verification_plan_ready');
      expect(skill).toContain('blueprintName');
      expect(skill).toContain('fileCount');
      expect(skill).toContain('contractVersion');
    });

    it('workflow-webhook terminates with verification_plan_ready', () => {
      const skill = read('skills/workflow-webhook/SKILL.md');
      expect(skill).toContain('verification_plan_ready');
      expect(skill).toContain('blueprintName');
      expect(skill).toContain('fileCount');
      expect(skill).toContain('contractVersion');
    });
  });

  // -----------------------------------------------------------------------
  // Artifact ownership: no direct .workflow-skills/*.json mutation
  // -----------------------------------------------------------------------
  describe('artifact ownership boundary', () => {
    it('workflow-approval does not reference .workflow-skills JSON paths', () => {
      const skill = read('skills/workflow-approval/SKILL.md');
      expect(skill).not.toContain('.workflow-skills/context.json');
      expect(skill).not.toContain('.workflow-skills/blueprints');
    });

    it('workflow-webhook does not reference .workflow-skills JSON paths', () => {
      const skill = read('skills/workflow-webhook/SKILL.md');
      expect(skill).not.toContain('.workflow-skills/context.json');
      expect(skill).not.toContain('.workflow-skills/blueprints');
    });
  });

  // -----------------------------------------------------------------------
  // Domain-specific required content: approval
  // -----------------------------------------------------------------------
  describe('workflow-approval domain constraints', () => {
    it('requires deterministic createHook() tokens', () => {
      const skill = read('skills/workflow-approval/SKILL.md');
      expect(skill).toContain('createHook');
      expect(skill).toContain('deterministic');
    });

    it('requires expiry via sleep()', () => {
      const skill = read('skills/workflow-approval/SKILL.md');
      expect(skill).toContain('sleep');
      expect(skill).toContain('Promise.race');
    });

    it('requires escalation behavior', () => {
      const skill = read('skills/workflow-approval/SKILL.md');
      expect(skill).toContain('escalation');
      expect(skill).toContain('escalat');
    });

    it('requires test helpers: waitForHook, resumeHook, waitForSleep, wakeUp', () => {
      const skill = read('skills/workflow-approval/SKILL.md');
      expect(skill).toContain('waitForHook');
      expect(skill).toContain('resumeHook');
      expect(skill).toContain('waitForSleep');
      expect(skill).toContain('wakeUp');
    });
  });

  // -----------------------------------------------------------------------
  // Domain-specific required content: webhook
  // -----------------------------------------------------------------------
  describe('workflow-webhook domain constraints', () => {
    it('requires duplicate-delivery handling', () => {
      const skill = read('skills/workflow-webhook/SKILL.md');
      expect(skill).toContain('duplicate');
      expect(skill).toContain('Duplicate-delivery handling');
    });

    it('requires stable idempotency keys', () => {
      const skill = read('skills/workflow-webhook/SKILL.md');
      expect(skill).toContain('idempotency');
      expect(skill).toContain('Stable idempotency keys');
    });

    it('requires webhook response mode selection', () => {
      const skill = read('skills/workflow-webhook/SKILL.md');
      expect(skill).toContain('Webhook response mode');
      expect(skill).toContain('static');
      expect(skill).toContain('manual');
    });

    it('requires compensation when downstream steps fail', () => {
      const skill = read('skills/workflow-webhook/SKILL.md');
      expect(skill).toContain('Compensation when downstream steps fail');
    });
  });

  // -----------------------------------------------------------------------
  // Goldens exist
  // -----------------------------------------------------------------------
  describe('scenario goldens exist', () => {
    it('workflow-approval has approval-expiry-escalation golden', () => {
      expect(
        existsSync(
          resolve(
            ROOT,
            'skills/workflow-approval/goldens/approval-expiry-escalation.md',
          ),
        ),
      ).toBe(true);
    });

    it('workflow-webhook has duplicate-webhook-order golden', () => {
      expect(
        existsSync(
          resolve(
            ROOT,
            'skills/workflow-webhook/goldens/duplicate-webhook-order.md',
          ),
        ),
      ).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Goldens include verification contract
  // -----------------------------------------------------------------------
  describe('scenario golden verification contract', () => {
    it('approval golden includes verification artifact and summary', () => {
      const golden = read(
        'skills/workflow-approval/goldens/approval-expiry-escalation.md',
      );
      expect(golden).toContain('## Verification Artifact');
      expect(golden).toContain('### Verification Summary');
      expect(golden).toContain('"event":"verification_plan_ready"');
    });

    it('webhook golden includes verification artifact and summary', () => {
      const golden = read(
        'skills/workflow-webhook/goldens/duplicate-webhook-order.md',
      );
      expect(golden).toContain('## Verification Artifact');
      expect(golden).toContain('### Verification Summary');
      expect(golden).toContain('"event":"verification_plan_ready"');
    });
  });

  // -----------------------------------------------------------------------
  // Docs and README mention scenario skills iff source exists
  // -----------------------------------------------------------------------
  describe('docs and README mention scenario skills', () => {
    it('getting-started doc mentions workflow-approval iff source exists', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      const exists = existsSync(
        resolve(ROOT, 'skills/workflow-approval/SKILL.md'),
      );
      expect(docs.includes('`/workflow-approval`')).toBe(exists);
    });

    it('getting-started doc mentions workflow-webhook iff source exists', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      const exists = existsSync(
        resolve(ROOT, 'skills/workflow-webhook/SKILL.md'),
      );
      expect(docs.includes('`/workflow-webhook`')).toBe(exists);
    });

    it('skills README mentions workflow-approval iff source exists', () => {
      const readme = read('skills/README.md');
      const exists = existsSync(
        resolve(ROOT, 'skills/workflow-approval/SKILL.md'),
      );
      expect(readme.includes('`workflow-approval`')).toBe(exists);
    });

    it('skills README mentions workflow-webhook iff source exists', () => {
      const readme = read('skills/README.md');
      const exists = existsSync(
        resolve(ROOT, 'skills/workflow-webhook/SKILL.md'),
      );
      expect(readme.includes('`workflow-webhook`')).toBe(exists);
    });
  });

  // -----------------------------------------------------------------------
  // No legacy vocabulary in scenario skills
  // -----------------------------------------------------------------------
  describe('legacy vocabulary absent from scenario skills', () => {
    const LEGACY_STAGES = [
      'workflow-design',
      'workflow-stress',
      'workflow-verify',
    ] as const;

    it('workflow-approval contains no legacy stage names', () => {
      const skill = read('skills/workflow-approval/SKILL.md');
      for (const legacy of LEGACY_STAGES) {
        expect(skill).not.toContain(legacy);
      }
    });

    it('workflow-webhook contains no legacy stage names', () => {
      const skill = read('skills/workflow-webhook/SKILL.md');
      for (const legacy of LEGACY_STAGES) {
        expect(skill).not.toContain(legacy);
      }
    });
  });
});
