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
  // Scenario skills exist: workflow-saga and workflow-timeout
  // -----------------------------------------------------------------------
  describe('saga and timeout scenario skills exist', () => {
    it('workflow-saga SKILL.md exists', () => {
      expect(
        existsSync(resolve(ROOT, 'skills/workflow-saga/SKILL.md')),
      ).toBe(true);
    });

    it('workflow-timeout SKILL.md exists', () => {
      expect(
        existsSync(resolve(ROOT, 'skills/workflow-timeout/SKILL.md')),
      ).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Frontmatter: workflow-saga and workflow-timeout
  // -----------------------------------------------------------------------
  describe('saga and timeout frontmatter', () => {
    it('workflow-saga has user-invocable: true and argument-hint', () => {
      const skill = read('skills/workflow-saga/SKILL.md');
      expect(skill).toContain('user-invocable: true');
      expect(skill).toContain('argument-hint:');
    });

    it('workflow-timeout has user-invocable: true and argument-hint', () => {
      const skill = read('skills/workflow-timeout/SKILL.md');
      expect(skill).toContain('user-invocable: true');
      expect(skill).toContain('argument-hint:');
    });
  });

  // -----------------------------------------------------------------------
  // Context reuse: workflow-saga and workflow-timeout
  // -----------------------------------------------------------------------
  describe('saga and timeout context reuse', () => {
    it('workflow-saga reuses .workflow.md and falls back to context capture', () => {
      const skill = read('skills/workflow-saga/SKILL.md');
      expect(skill).toContain('.workflow.md');
      expect(skill).toContain('Context Capture');
    });

    it('workflow-timeout reuses .workflow.md and falls back to context capture', () => {
      const skill = read('skills/workflow-timeout/SKILL.md');
      expect(skill).toContain('.workflow.md');
      expect(skill).toContain('Context Capture');
    });
  });

  // -----------------------------------------------------------------------
  // Verification contract: workflow-saga and workflow-timeout
  // -----------------------------------------------------------------------
  describe('saga and timeout verification contract', () => {
    it('workflow-saga terminates with verification_plan_ready', () => {
      const skill = read('skills/workflow-saga/SKILL.md');
      expect(skill).toContain('verification_plan_ready');
      expect(skill).toContain('blueprintName');
      expect(skill).toContain('fileCount');
      expect(skill).toContain('contractVersion');
    });

    it('workflow-timeout terminates with verification_plan_ready', () => {
      const skill = read('skills/workflow-timeout/SKILL.md');
      expect(skill).toContain('verification_plan_ready');
      expect(skill).toContain('blueprintName');
      expect(skill).toContain('fileCount');
      expect(skill).toContain('contractVersion');
    });
  });

  // -----------------------------------------------------------------------
  // Artifact ownership: workflow-saga and workflow-timeout
  // -----------------------------------------------------------------------
  describe('saga and timeout artifact ownership', () => {
    it('workflow-saga does not reference .workflow-skills JSON paths', () => {
      const skill = read('skills/workflow-saga/SKILL.md');
      expect(skill).not.toContain('.workflow-skills/context.json');
      expect(skill).not.toContain('.workflow-skills/blueprints');
    });

    it('workflow-timeout does not reference .workflow-skills JSON paths', () => {
      const skill = read('skills/workflow-timeout/SKILL.md');
      expect(skill).not.toContain('.workflow-skills/context.json');
      expect(skill).not.toContain('.workflow-skills/blueprints');
    });
  });

  // -----------------------------------------------------------------------
  // Domain-specific required content: saga
  // -----------------------------------------------------------------------
  describe('workflow-saga domain constraints', () => {
    it('requires compensation ordering and idempotency', () => {
      const skill = read('skills/workflow-saga/SKILL.md');
      expect(skill).toContain('compensation');
      expect(skill).toContain('Compensation ordering');
      expect(skill).toContain('Compensation idempotency keys');
    });

    it('requires partial failure handling', () => {
      const skill = read('skills/workflow-saga/SKILL.md');
      expect(skill).toContain('partial');
      expect(skill).toContain('FatalError');
      expect(skill).toContain('RetryableError');
    });
  });

  // -----------------------------------------------------------------------
  // Domain-specific required content: timeout
  // -----------------------------------------------------------------------
  describe('workflow-timeout domain constraints', () => {
    it('requires sleep/wake-up correctness', () => {
      const skill = read('skills/workflow-timeout/SKILL.md');
      expect(skill).toContain('sleep');
      expect(skill).toContain('waitForSleep');
      expect(skill).toContain('wakeUp');
    });

    it('requires hook/sleep races via Promise.race', () => {
      const skill = read('skills/workflow-timeout/SKILL.md');
      expect(skill).toContain('Promise.race');
      expect(skill).toContain('createHook');
    });

    it('treats timeout as domain outcome', () => {
      const skill = read('skills/workflow-timeout/SKILL.md');
      expect(skill).toContain('Timeout as a domain outcome');
    });
  });

  // -----------------------------------------------------------------------
  // Goldens exist: saga and timeout
  // -----------------------------------------------------------------------
  describe('saga and timeout goldens exist', () => {
    it('workflow-saga has compensation-saga golden', () => {
      expect(
        existsSync(
          resolve(ROOT, 'skills/workflow-saga/goldens/compensation-saga.md'),
        ),
      ).toBe(true);
    });

    it('workflow-timeout has approval-timeout-streaming golden', () => {
      expect(
        existsSync(
          resolve(
            ROOT,
            'skills/workflow-timeout/goldens/approval-timeout-streaming.md',
          ),
        ),
      ).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Golden verification contract: saga and timeout
  // -----------------------------------------------------------------------
  describe('saga and timeout golden verification contract', () => {
    it('saga golden includes verification artifact and summary', () => {
      const golden = read(
        'skills/workflow-saga/goldens/compensation-saga.md',
      );
      expect(golden).toContain('## Verification Artifact');
      expect(golden).toContain('### Verification Summary');
      expect(golden).toContain('"event":"verification_plan_ready"');
    });

    it('timeout golden includes verification artifact and summary', () => {
      const golden = read(
        'skills/workflow-timeout/goldens/approval-timeout-streaming.md',
      );
      expect(golden).toContain('## Verification Artifact');
      expect(golden).toContain('### Verification Summary');
      expect(golden).toContain('"event":"verification_plan_ready"');
    });
  });

  // -----------------------------------------------------------------------
  // Docs and README mention saga and timeout iff source exists
  // -----------------------------------------------------------------------
  describe('docs and README mention saga and timeout skills', () => {
    it('getting-started doc mentions workflow-saga iff source exists', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      const exists = existsSync(
        resolve(ROOT, 'skills/workflow-saga/SKILL.md'),
      );
      expect(docs.includes('`/workflow-saga`')).toBe(exists);
    });

    it('getting-started doc mentions workflow-timeout iff source exists', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      const exists = existsSync(
        resolve(ROOT, 'skills/workflow-timeout/SKILL.md'),
      );
      expect(docs.includes('`/workflow-timeout`')).toBe(exists);
    });

    it('skills README mentions workflow-saga iff source exists', () => {
      const readme = read('skills/README.md');
      const exists = existsSync(
        resolve(ROOT, 'skills/workflow-saga/SKILL.md'),
      );
      expect(readme.includes('`workflow-saga`')).toBe(exists);
    });

    it('skills README mentions workflow-timeout iff source exists', () => {
      const readme = read('skills/README.md');
      const exists = existsSync(
        resolve(ROOT, 'skills/workflow-timeout/SKILL.md'),
      );
      expect(readme.includes('`workflow-timeout`')).toBe(exists);
    });
  });

  // -----------------------------------------------------------------------
  // Scenario skills exist: workflow-idempotency and workflow-observe
  // -----------------------------------------------------------------------
  describe('idempotency and observe scenario skills exist', () => {
    it('workflow-idempotency SKILL.md exists', () => {
      expect(
        existsSync(resolve(ROOT, 'skills/workflow-idempotency/SKILL.md')),
      ).toBe(true);
    });

    it('workflow-observe SKILL.md exists', () => {
      expect(
        existsSync(resolve(ROOT, 'skills/workflow-observe/SKILL.md')),
      ).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Frontmatter: workflow-idempotency and workflow-observe
  // -----------------------------------------------------------------------
  describe('idempotency and observe frontmatter', () => {
    it('workflow-idempotency has user-invocable: true and argument-hint', () => {
      const skill = read('skills/workflow-idempotency/SKILL.md');
      expect(skill).toContain('user-invocable: true');
      expect(skill).toContain('argument-hint:');
    });

    it('workflow-observe has user-invocable: true and argument-hint', () => {
      const skill = read('skills/workflow-observe/SKILL.md');
      expect(skill).toContain('user-invocable: true');
      expect(skill).toContain('argument-hint:');
    });
  });

  // -----------------------------------------------------------------------
  // Context reuse: workflow-idempotency and workflow-observe
  // -----------------------------------------------------------------------
  describe('idempotency and observe context reuse', () => {
    it('workflow-idempotency reuses .workflow.md and falls back to context capture', () => {
      const skill = read('skills/workflow-idempotency/SKILL.md');
      expect(skill).toContain('.workflow.md');
      expect(skill).toContain('Context Capture');
    });

    it('workflow-observe reuses .workflow.md and falls back to context capture', () => {
      const skill = read('skills/workflow-observe/SKILL.md');
      expect(skill).toContain('.workflow.md');
      expect(skill).toContain('Context Capture');
    });
  });

  // -----------------------------------------------------------------------
  // Verification contract: workflow-idempotency and workflow-observe
  // -----------------------------------------------------------------------
  describe('idempotency and observe verification contract', () => {
    it('workflow-idempotency terminates with verification_plan_ready', () => {
      const skill = read('skills/workflow-idempotency/SKILL.md');
      expect(skill).toContain('verification_plan_ready');
      expect(skill).toContain('blueprintName');
      expect(skill).toContain('fileCount');
      expect(skill).toContain('contractVersion');
    });

    it('workflow-observe terminates with verification_plan_ready', () => {
      const skill = read('skills/workflow-observe/SKILL.md');
      expect(skill).toContain('verification_plan_ready');
      expect(skill).toContain('blueprintName');
      expect(skill).toContain('fileCount');
      expect(skill).toContain('contractVersion');
    });
  });

  // -----------------------------------------------------------------------
  // Artifact ownership: workflow-idempotency and workflow-observe
  // -----------------------------------------------------------------------
  describe('idempotency and observe artifact ownership', () => {
    it('workflow-idempotency does not reference .workflow-skills JSON paths', () => {
      const skill = read('skills/workflow-idempotency/SKILL.md');
      expect(skill).not.toContain('.workflow-skills/context.json');
      expect(skill).not.toContain('.workflow-skills/blueprints');
    });

    it('workflow-observe does not reference .workflow-skills JSON paths', () => {
      const skill = read('skills/workflow-observe/SKILL.md');
      expect(skill).not.toContain('.workflow-skills/context.json');
      expect(skill).not.toContain('.workflow-skills/blueprints');
    });
  });

  // -----------------------------------------------------------------------
  // Domain-specific required content: idempotency
  // -----------------------------------------------------------------------
  describe('workflow-idempotency domain constraints', () => {
    it('requires duplicate delivery detection and idempotency keys', () => {
      const skill = read('skills/workflow-idempotency/SKILL.md');
      expect(skill).toContain('duplicate');
      expect(skill).toContain('idempotency');
      expect(skill).toContain('Duplicate delivery detection');
      expect(skill).toContain('Stable idempotency keys');
    });

    it('requires replay safety', () => {
      const skill = read('skills/workflow-idempotency/SKILL.md');
      expect(skill).toContain('Replay safety');
      expect(skill).toContain('replay');
    });

    it('requires compensation with idempotency keys', () => {
      const skill = read('skills/workflow-idempotency/SKILL.md');
      expect(skill).toContain('Compensation with idempotency keys');
      expect(skill).toContain('RetryableError');
    });
  });

  // -----------------------------------------------------------------------
  // Domain-specific required content: observe
  // -----------------------------------------------------------------------
  describe('workflow-observe domain constraints', () => {
    it('requires stream namespace separation', () => {
      const skill = read('skills/workflow-observe/SKILL.md');
      expect(skill).toContain('stream');
      expect(skill).toContain('namespace');
      expect(skill).toContain('Stream namespace separation');
    });

    it('requires stream I/O placement in steps', () => {
      const skill = read('skills/workflow-observe/SKILL.md');
      expect(skill).toContain('Stream I/O placement');
      expect(skill).toContain('getWritable');
    });

    it('requires terminal signals on every exit path', () => {
      const skill = read('skills/workflow-observe/SKILL.md');
      expect(skill).toContain('Terminal signals');
      expect(skill).toContain('operator');
    });

    it('requires structured stream events', () => {
      const skill = read('skills/workflow-observe/SKILL.md');
      expect(skill).toContain('Structured stream events');
    });
  });

  // -----------------------------------------------------------------------
  // Goldens exist: idempotency and observe
  // -----------------------------------------------------------------------
  describe('idempotency and observe goldens exist', () => {
    it('workflow-idempotency has duplicate-webhook-order golden', () => {
      expect(
        existsSync(
          resolve(ROOT, 'skills/workflow-idempotency/goldens/duplicate-webhook-order.md'),
        ),
      ).toBe(true);
    });

    it('workflow-observe has operator-observability-streams golden', () => {
      expect(
        existsSync(
          resolve(
            ROOT,
            'skills/workflow-observe/goldens/operator-observability-streams.md',
          ),
        ),
      ).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Golden verification contract: idempotency and observe
  // -----------------------------------------------------------------------
  describe('idempotency and observe golden verification contract', () => {
    it('idempotency golden includes verification artifact and summary', () => {
      const golden = read(
        'skills/workflow-idempotency/goldens/duplicate-webhook-order.md',
      );
      expect(golden).toContain('## Verification Artifact');
      expect(golden).toContain('### Verification Summary');
      expect(golden).toContain('"event":"verification_plan_ready"');
    });

    it('observe golden includes verification artifact and summary', () => {
      const golden = read(
        'skills/workflow-observe/goldens/operator-observability-streams.md',
      );
      expect(golden).toContain('## Verification Artifact');
      expect(golden).toContain('### Verification Summary');
      expect(golden).toContain('"event":"verification_plan_ready"');
    });
  });

  // -----------------------------------------------------------------------
  // Docs and README mention idempotency and observe iff source exists
  // -----------------------------------------------------------------------
  describe('docs and README mention idempotency and observe skills', () => {
    it('getting-started doc mentions workflow-idempotency iff source exists', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      const exists = existsSync(
        resolve(ROOT, 'skills/workflow-idempotency/SKILL.md'),
      );
      expect(docs.includes('`/workflow-idempotency`')).toBe(exists);
    });

    it('getting-started doc mentions workflow-observe iff source exists', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      const exists = existsSync(
        resolve(ROOT, 'skills/workflow-observe/SKILL.md'),
      );
      expect(docs.includes('`/workflow-observe`')).toBe(exists);
    });

    it('skills README mentions workflow-idempotency iff source exists', () => {
      const readme = read('skills/README.md');
      const exists = existsSync(
        resolve(ROOT, 'skills/workflow-idempotency/SKILL.md'),
      );
      expect(readme.includes('`workflow-idempotency`')).toBe(exists);
    });

    it('skills README mentions workflow-observe iff source exists', () => {
      const readme = read('skills/README.md');
      const exists = existsSync(
        resolve(ROOT, 'skills/workflow-observe/SKILL.md'),
      );
      expect(readme.includes('`workflow-observe`')).toBe(exists);
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

    it('workflow-saga contains no legacy stage names', () => {
      const skill = read('skills/workflow-saga/SKILL.md');
      for (const legacy of LEGACY_STAGES) {
        expect(skill).not.toContain(legacy);
      }
    });

    it('workflow-timeout contains no legacy stage names', () => {
      const skill = read('skills/workflow-timeout/SKILL.md');
      for (const legacy of LEGACY_STAGES) {
        expect(skill).not.toContain(legacy);
      }
    });

    it('workflow-idempotency contains no legacy stage names', () => {
      const skill = read('skills/workflow-idempotency/SKILL.md');
      for (const legacy of LEGACY_STAGES) {
        expect(skill).not.toContain(legacy);
      }
    });

    it('workflow-observe contains no legacy stage names', () => {
      const skill = read('skills/workflow-observe/SKILL.md');
      for (const legacy of LEGACY_STAGES) {
        expect(skill).not.toContain(legacy);
      }
    });
  });
});
