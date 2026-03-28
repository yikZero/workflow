import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

interface SkillSurface {
  core: string[];
  scenario: string[];
  optional: string[];
  discovered: string[];
  counts: {
    core: number;
    scenarios: number;
    optional: number;
    skills: number;
    installDirectories: number;
    goldensPerProvider: number;
    providers: number;
    outputsPerProvider: number;
    totalOutputs: number;
  };
}

interface BuildCheckOutput {
  ok: boolean;
  providers: string[];
  skillSurface: SkillSurface;
  skills: Array<{
    name: string;
    version: string;
    goldens: number;
    checksum: string;
  }>;
  outputs: Array<{
    provider: string;
    skill: string;
    dest: string;
    checksum: string;
    type?: string;
  }>;
  totalOutputs: number;
}

function getBuildPlan(): BuildCheckOutput {
  const stdout = execSync('node scripts/build-workflow-skills.mjs --check', {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout);
}

let cachedPlan: BuildCheckOutput | undefined;
function getCachedBuildPlan(): BuildCheckOutput {
  cachedPlan ??= getBuildPlan();
  return cachedPlan;
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
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      expect(docs).toContain('two-stage');
      expect(docs).toContain('/workflow-teach');
      expect(docs).toContain('/workflow-build');
      expect(docs).toContain(
        'The `workflow` skill is an always-on API reference'
      );
    });

    it('skills README describes the same two-skill workflow', () => {
      const readme = read('skills/README.md');
      expect(readme).toContain('Two-skill workflow');
      expect(readme).toContain('`workflow-teach`');
      expect(readme).toContain('`workflow-build`');
      expect(readme).toContain(
        '`workflow` skill is an always-on API reference'
      );
    });

    it('getting-started stage table lists teach as Stage 1 and build as Stage 2', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
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
        'docs/content/docs/getting-started/workflow-skills.mdx'
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
        'docs/content/docs/getting-started/workflow-skills.mdx'
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
        'docs/content/docs/getting-started/workflow-skills.mdx'
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
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      expect(docs).toContain('Skill-managed');
      expect(docs).toContain('.workflow.md');
      // workflow-teach writes .workflow.md
      expect(docs).toMatch(/Written.*by.*`workflow-teach`/s);
    });

    it('docs describe .workflow-skills/*.json as host-managed', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      expect(docs).toContain('Host-managed');
      expect(docs).toContain('.workflow-skills/context.json');
      expect(docs).toContain('.workflow-skills/blueprints/<name>.json');
      expect(docs).toContain('.workflow-skills/verification/<name>.json');
      // Must explain host ownership — skill prompts don't reference JSON paths
      expect(docs).toContain(
        'managed by the host runtime or persistence layer'
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
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      expect(docs).toMatch(/\.workflow\.md.*written.*directly/is);
    });

    it('docs explain that .workflow-skills/*.json are host-managed', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      expect(docs).toContain('not by the skill prompts');
    });

    it('README explains that .workflow-skills/*.json are host-managed', () => {
      const readme = read('skills/README.md');
      expect(readme).toMatch(/not\s+by\s+the\s+skill\s+prompts/);
    });
  });

  // -----------------------------------------------------------------------
  // Legacy artifact ownership regression guards
  // -----------------------------------------------------------------------
  describe('legacy artifact ownership regression', () => {
    it('getting-started doc no longer uses the legacy artifact ownership layout', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      // The legacy table used "Written By" as a column header
      expect(docs).not.toContain('| Artifact | Path | Written By |');
      // Legacy docs described JSON paths as individual sections owned by skills
      expect(docs).not.toContain('### `.workflow-skills/context.json`');
      expect(docs).not.toContain(
        '### `.workflow-skills/blueprints/<name>.json`'
      );
      expect(docs).not.toContain(
        '### `.workflow-skills/verification/<name>.json`'
      );
    });

    it('getting-started doc explicitly says host-managed JSON paths are not referenced by skill text', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      expect(docs).toContain(
        'The skill text never references these JSON paths directly'
      );
      expect(docs).toContain(
        'managed by the host runtime or persistence layer'
      );
    });
  });

  // -----------------------------------------------------------------------
  // Integration test path convention
  // -----------------------------------------------------------------------
  describe('integration test path convention', () => {
    it('workflow-build uses one integration-test path convention', () => {
      const skill = read('skills/workflow-build/SKILL.md');
      expect(skill).toContain('workflows/<name>.integration.test.ts');
      expect(skill).not.toContain('__tests__/<name>.test.ts');
    });
  });

  // -----------------------------------------------------------------------
  // Verification schema: testMatrix field
  // -----------------------------------------------------------------------
  describe('verification schema completeness', () => {
    it('getting-started verification example includes a testMatrix field', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      expect(docs).toContain('"testMatrix"');
    });

    it('workflow-build verification artifact includes a testMatrix field', () => {
      const skill = read('skills/workflow-build/SKILL.md');
      expect(skill).toContain('"testMatrix"');
    });

    it('workflow-build Phase 4 lists optional route file', () => {
      const skill = read('skills/workflow-build/SKILL.md');
      expect(skill).toContain('app/api/<name>/route.ts');
      expect(skill).toContain('Optional route file');
    });

    it('files-array sentinel sentence appears in both skill and docs', () => {
      const skill = read('skills/workflow-build/SKILL.md');
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      const sentinel =
        'The `files` array must list only files that are actually produced.';
      expect(skill).toContain(sentinel);
      expect(docs).toContain(sentinel);
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
  // Installed skill count
  // -----------------------------------------------------------------------
  describe('installed skill count', () => {
    it('getting-started doc reports the correct installed skill count', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      const plan = getCachedBuildPlan();
      expect(docs).toContain(
        `After copying, you should see ${plan.skillSurface.counts.installDirectories} skill directories:`
      );
    });
  });

  // -----------------------------------------------------------------------
  // Scenario surface: all six scenario skills in docs, install, and README
  // -----------------------------------------------------------------------
  describe('scenario surface is explicit', () => {
    it('getting-started doc lists every current scenario command from the build plan', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      const plan = getCachedBuildPlan();

      console.log(
        JSON.stringify({
          event: 'docs_expected_surface',
          scenarios: plan.skillSurface.scenario,
          installDirectories: plan.skillSurface.counts.installDirectories,
          totalOutputs: plan.totalOutputs,
        })
      );

      for (const skill of plan.skillSurface.scenario) {
        expect(docs).toContain(`/${skill}`);
      }
    });

    it('install section reports the current install-directory count', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      const plan = getCachedBuildPlan();
      expect(docs).toContain(
        `After copying, you should see ${plan.skillSurface.counts.installDirectories} skill directories:`
      );
    });

    it('build-output example matches the live build plan', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      const plan = getCachedBuildPlan();
      expect(docs).toMatch(
        new RegExp(`"totalOutputs"\\s*:\\s*${plan.totalOutputs}`)
      );
      expect(docs).toMatch(
        new RegExp(
          `"count"\\s*:\\s*${plan.skillSurface.counts.installDirectories}`
        )
      );
    });

    it('README lists every scenario entrypoint and golden family', () => {
      const readme = read('skills/README.md');
      const plan = getCachedBuildPlan();
      for (const skill of plan.skillSurface.scenario) {
        expect(readme).toContain(`\`${skill}\``);
      }
      expect(readme).toContain('### `workflow-saga/goldens/`');
      expect(readme).toContain('### `workflow-timeout/goldens/`');
      expect(readme).toContain('### `workflow-idempotency/goldens/`');
      expect(readme).toContain('### `workflow-observe/goldens/`');
    });

    it('sample build output numbers are internally consistent', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      const plan = getCachedBuildPlan();
      // The "totalOutputs" in the manifest summary and the plan_computed event must match
      const manifestMatch = docs.match(/"totalOutputs":\s*(\d+)/g);
      expect(manifestMatch).not.toBeNull();
      const values = manifestMatch!.map((m) => m.match(/\d+/)![0]);
      // All totalOutputs references should be the same number
      expect(new Set(values).size).toBe(1);
      // The skills_discovered count should match the live build plan
      expect(docs).toContain(
        `"count":${plan.skillSurface.counts.installDirectories}`
      );
    });
  });

  // -----------------------------------------------------------------------
  // Validator inspection guidance
  // -----------------------------------------------------------------------
  describe('validator inspection guidance', () => {
    it('getting-started doc includes Inspect Validation Output section', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      expect(docs).toContain('## Inspect Validation Output');
    });

    it('validator inspection shows stdout as machine-readable result', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      expect(docs).toContain('machine-readable result');
      expect(docs).toContain('workflow-skills-validate.json');
    });

    it('validator inspection shows stderr as JSONL logs', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      expect(docs).toContain('JSON logs on stderr');
      expect(docs).toContain('workflow-skills-validate.log');
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

  // -----------------------------------------------------------------------
  // Six-phase build flow
  // -----------------------------------------------------------------------
  describe('six-phase build flow', () => {
    it('getting-started doc describes six interactive phases', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      expect(docs).toContain('six interactive phases');
      expect(docs).not.toContain('five interactive phases');
    });

    it('getting-started doc includes Phase 6 verification summary', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      expect(docs).toContain('Verification summary');
      expect(docs).toContain('verification_plan_ready');
    });
  });

  // -----------------------------------------------------------------------
  // Package README parity with teach→build vocabulary
  // -----------------------------------------------------------------------
  describe('package README parity', () => {
    it('package README describes teach-then-build two-stage loop', () => {
      const readme = read('packages/workflow/README.md');
      expect(readme).toContain('two-stage loop');
      expect(readme).toContain('teach');
      expect(readme).toContain('build');
    });

    it('package README contains no legacy four-stage vocabulary', () => {
      const readme = read('packages/workflow/README.md');
      for (const legacy of LEGACY_STAGES) {
        expect(readme).not.toContain(legacy);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Compensation-saga golden includes testMatrix
  // -----------------------------------------------------------------------
  describe('golden verification artifact schema', () => {
    it('compensation-saga golden includes testMatrix field', () => {
      const golden = read('skills/workflow-build/goldens/compensation-saga.md');
      expect(golden).toContain('"testMatrix"');
    });
  });

  // -----------------------------------------------------------------------
  // Scenario skill parity: docs, README, source files, and goldens
  // -----------------------------------------------------------------------
  describe('scenario skill parity', () => {
    it('docs and README list every user-invocable scenario skill', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      const readme = read('skills/README.md');
      for (const skill of [
        'workflow-approval',
        'workflow-webhook',
        'workflow-saga',
        'workflow-timeout',
        'workflow-idempotency',
        'workflow-observe',
      ]) {
        expect(docs).toContain(`\`/${skill}\``);
        expect(readme).toContain(`\`${skill}\``);
      }
    });

    it('every documented scenario skill has a source file and golden', () => {
      for (const [skill, golden] of [
        ['workflow-approval', 'approval-expiry-escalation.md'],
        ['workflow-webhook', 'duplicate-webhook-order.md'],
        ['workflow-saga', 'compensation-saga.md'],
        ['workflow-timeout', 'approval-timeout-streaming.md'],
        ['workflow-idempotency', 'duplicate-webhook-order.md'],
        ['workflow-observe', 'operator-observability-streams.md'],
      ]) {
        expect(existsSync(resolve(ROOT, `skills/${skill}/SKILL.md`))).toBe(
          true
        );
        expect(
          existsSync(resolve(ROOT, `skills/${skill}/goldens/${golden}`))
        ).toBe(true);
      }
    });

    it('docs include sample prompts for scenario commands', () => {
      const docs = read(
        'docs/content/docs/getting-started/workflow-skills.mdx'
      );
      expect(docs).toContain(
        '/workflow-saga reserve inventory, charge payment, compensate on shipping failure'
      );
      expect(docs).toContain(
        '/workflow-timeout wait 24h for approval, then expire'
      );
      expect(docs).toContain(
        '/workflow-idempotency make duplicate webhook delivery safe'
      );
      expect(docs).toContain(
        '/workflow-observe stream operator progress and final status'
      );
    });
  });
});
