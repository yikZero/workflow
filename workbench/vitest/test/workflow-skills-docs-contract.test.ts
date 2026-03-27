import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

// ---------------------------------------------------------------------------
// Legacy vocabulary that must never reappear in shipped docs or skills
// ---------------------------------------------------------------------------
const LEGACY_STAGES = [
  'workflow-design',
  'workflow-stress',
  'workflow-verify',
] as const;

describe('workflow skills docs contract surfaces', () => {
  // -----------------------------------------------------------------------
  // Canonical two-stage loop
  // -----------------------------------------------------------------------
  describe('canonical loop: workflow-teach then workflow-build', () => {
    it('getting-started doc describes a two-stage teach-then-build loop', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      expect(docs).toContain('two-stage');
      expect(docs).toContain('/workflow-teach');
      expect(docs).toContain('/workflow-build');
      expect(docs).toContain(
        'The `workflow` skill is an always-on API reference',
      );
    });

    it('skills README describes the same two-skill workflow', () => {
      const readme = read('skills/README.md');
      expect(readme).toContain('Two-skill workflow');
      expect(readme).toContain('`workflow-teach`');
      expect(readme).toContain('`workflow-build`');
      expect(readme).toContain(
        '`workflow` skill is an always-on API reference',
      );
    });

    it('getting-started stage table lists teach as Stage 1 and build as Stage 2', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      // Table row: | 1 | `/workflow-teach` | ...
      expect(docs).toMatch(/\|\s*1\s*\|.*workflow-teach/);
      // Table row: | 2 | `/workflow-build` | ...
      expect(docs).toMatch(/\|\s*2\s*\|.*workflow-build/);
    });
  });

  // -----------------------------------------------------------------------
  // Core surface: workflow, workflow-teach, workflow-build
  // -----------------------------------------------------------------------
  describe('core surface is explicitly named', () => {
    it('getting-started doc names the three core skill directories', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      expect(docs).toContain('`workflow`');
      expect(docs).toContain('`workflow-teach`');
      expect(docs).toContain('`workflow-build`');
    });

    it('skills README lists the three core skills under a core heading', () => {
      const readme = read('skills/README.md');
      expect(readme).toContain('Core surface');
      expect(readme).toContain('`workflow`');
      expect(readme).toContain('`workflow-teach`');
      expect(readme).toContain('`workflow-build`');
    });

    it('getting-started doc describes workflow-init as optional helper', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      expect(docs).toMatch(/optional.*workflow-init/is);
    });

    it('skills README lists workflow-init under optional helpers', () => {
      const readme = read('skills/README.md');
      expect(readme).toContain('Optional helpers');
      expect(readme).toContain('`workflow-init`');
    });
  });

  // -----------------------------------------------------------------------
  // Legacy stage vocabulary must not appear
  // -----------------------------------------------------------------------
  describe('legacy stage vocabulary is absent', () => {
    it('getting-started doc contains no legacy stage names', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      for (const legacy of LEGACY_STAGES) {
        expect(docs).not.toContain(legacy);
      }
    });

    it('skills README contains no legacy stage names', () => {
      const readme = read('skills/README.md');
      for (const legacy of LEGACY_STAGES) {
        expect(readme).not.toContain(legacy);
      }
    });

    it('workflow-teach skill contains no legacy stage names', () => {
      const skill = read('skills/workflow-teach/SKILL.md');
      for (const legacy of LEGACY_STAGES) {
        expect(skill).not.toContain(legacy);
      }
    });

    it('workflow-build skill contains no legacy stage names', () => {
      const skill = read('skills/workflow-build/SKILL.md');
      for (const legacy of LEGACY_STAGES) {
        expect(skill).not.toContain(legacy);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Artifact ownership: .workflow.md (skill-managed) vs .workflow-skills/*.json (host-managed)
  // -----------------------------------------------------------------------
  describe('artifact ownership model', () => {
    it('docs describe .workflow.md as skill-managed', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      expect(docs).toContain('Skill-managed');
      expect(docs).toContain('.workflow.md');
      // workflow-teach writes .workflow.md
      expect(docs).toMatch(/Written.*by.*`workflow-teach`/s);
    });

    it('docs describe .workflow-skills/*.json as host-managed', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      expect(docs).toContain('Host-managed');
      expect(docs).toContain('.workflow-skills/context.json');
      expect(docs).toContain('.workflow-skills/blueprints/<name>.json');
      expect(docs).toContain('.workflow-skills/verification/<name>.json');
      // Must explain host ownership — skill prompts don't reference JSON paths
      expect(docs).toContain(
        'managed by the host runtime or persistence layer',
      );
    });

    it('README distinguishes skill-managed from host-managed artifacts', () => {
      const readme = read('skills/README.md');
      expect(readme).toContain('Skill-managed');
      expect(readme).toContain('Host-managed');
      expect(readme).toContain('.workflow.md');
      expect(readme).toContain('.workflow-skills/*.json');
    });

    it('workflow-teach skill references .workflow.md but not JSON artifact paths', () => {
      const skill = read('skills/workflow-teach/SKILL.md');
      expect(skill).toContain('.workflow.md');
      expect(skill).not.toContain('.workflow-skills/context.json');
      expect(skill).not.toContain('.workflow-skills/blueprints');
    });

    it('workflow-build skill references .workflow.md but not JSON artifact paths', () => {
      const skill = read('skills/workflow-build/SKILL.md');
      expect(skill).toContain('.workflow.md');
      expect(skill).not.toContain('.workflow-skills/context.json');
      expect(skill).not.toContain('.workflow-skills/blueprints');
    });

    it('docs explain that .workflow.md is written by the assistant flow', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      expect(docs).toMatch(/\.workflow\.md.*written.*directly/is);
    });

    it('docs explain that .workflow-skills/*.json are host-managed', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx',
      );
      expect(docs).toContain(
        'not by the skill prompts',
      );
    });

    it('README explains that .workflow-skills/*.json are host-managed', () => {
      const readme = read('skills/README.md');
      expect(readme).toMatch(
        /not\s+by\s+the\s+skill\s+prompts/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Verification summary contract (workflow-build)
  // -----------------------------------------------------------------------
  describe('verification summary contract', () => {
    it('workflow-build skill requires a machine-parseable verification summary', () => {
      const skill = read('skills/workflow-build/SKILL.md');
      expect(skill).toContain('verification_plan_ready');
      expect(skill).toContain('blueprintName');
      expect(skill).toContain('fileCount');
      expect(skill).toContain('testCount');
      expect(skill).toContain('runtimeCommandCount');
      expect(skill).toContain('contractVersion');
    });

    it('workflow-build golden demonstrates verification summary format', () => {
      const golden = read('skills/workflow-build/goldens/compensation-saga.md');
      expect(golden).toContain('## Verification Artifact');
      expect(golden).toContain('### Verification Summary');
      expect(golden).toContain('"event":"verification_plan_ready"');
    });
  });

  // -----------------------------------------------------------------------
  // Docs show full verification runtime command set
  // -----------------------------------------------------------------------
  it('docs show the full verification runtime command set', () => {
    const docs = read('docs/content/docs/getting-started/workflow-skills.mdx');
    expect(docs).toContain('"name": "typecheck"');
    expect(docs).toContain('"name": "test"');
    expect(docs).toContain('"name": "focused-workflow-test"');
  });
});
