import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

interface BuildCheckOutput {
  ok: boolean;
  providers: string[];
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

const SCENARIO_SKILLS = [
  'workflow-approval',
  'workflow-webhook',
  'workflow-saga',
  'workflow-timeout',
  'workflow-idempotency',
  'workflow-observe',
] as const;

describe('workflow skill bundle parity', () => {
  it('docs and README mention workflow-init iff the source skill exists', () => {
    const docs = read('docs/content/docs/getting-started/workflow-skills.mdx');
    const readme = read('skills/README.md');
    const initExists = existsSync(
      resolve(ROOT, 'skills/workflow-init/SKILL.md')
    );

    console.log(
      JSON.stringify({
        event: 'bundle_parity_check',
        skill: 'workflow-init',
        skillFileExists: initExists,
        docsContains: docs.includes('`workflow-init`'),
        readmeContains: readme.includes('`workflow-init`'),
      })
    );

    expect(docs.includes('`workflow-init`')).toBe(initExists);
    expect(readme.includes('`workflow-init`')).toBe(initExists);
  });

  it('core skills all have SKILL.md files', () => {
    const coreSkills = [
      'workflow',
      'workflow-teach',
      'workflow-build',
    ] as const;

    for (const skill of coreSkills) {
      const skillPath = resolve(ROOT, `skills/${skill}/SKILL.md`);
      const exists = existsSync(skillPath);

      console.log(
        JSON.stringify({
          event: 'core_skill_check',
          skill,
          exists,
        })
      );

      expect(exists, `skills/${skill}/SKILL.md must exist`).toBe(true);
    }
  });

  it('scenario skills have SKILL.md files when referenced in docs', () => {
    const scenarioSkills = SCENARIO_SKILLS;
    const docs = read('docs/content/docs/getting-started/workflow-skills.mdx');

    for (const skill of scenarioSkills) {
      const skillPath = resolve(ROOT, `skills/${skill}/SKILL.md`);
      const exists = existsSync(skillPath);
      const mentioned = docs.includes(`\`/${skill}\``);

      console.log(
        JSON.stringify({
          event: 'scenario_skill_check',
          skill,
          exists,
          mentionedInDocs: mentioned,
        })
      );

      // If mentioned in docs, must exist
      if (mentioned) {
        expect(
          exists,
          `skills/${skill}/SKILL.md must exist when referenced in docs`
        ).toBe(true);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Provider bundle parity: build plan includes scenario skills for all providers
  // ---------------------------------------------------------------------------
  describe('provider bundle includes scenario skills', () => {
    // Uses the shared SCENARIO_SKILLS constant defined at module scope

    it('build --check succeeds', () => {
      const plan = getBuildPlan();

      console.log(
        JSON.stringify({
          event: 'build_check_result',
          ok: plan.ok,
          providers: plan.providers,
          totalOutputs: plan.totalOutputs,
        })
      );

      expect(plan.ok).toBe(true);
    });

    it('build plan lists all currently supported providers', () => {
      const plan = getBuildPlan();
      expect(plan.providers).toContain('claude-code');
      expect(plan.providers).toContain('cursor');
      expect(plan.providers.length).toBeGreaterThanOrEqual(2);
    });

    it('every provider bundle includes every scenario skill', () => {
      const plan = getBuildPlan();

      for (const provider of plan.providers) {
        const providerSkills = plan.outputs
          .filter((o) => o.provider === provider && !o.type)
          .map((o) => o.skill);

        for (const scenario of SCENARIO_SKILLS) {
          console.log(
            JSON.stringify({
              event: 'provider_scenario_parity',
              provider,
              scenario,
              included: providerSkills.includes(scenario),
            })
          );

          expect(
            providerSkills,
            `provider "${provider}" must include skill "${scenario}"`
          ).toContain(scenario);
        }
      }
    });

    it('every provider bundle includes scenario goldens', () => {
      const plan = getBuildPlan();

      for (const provider of plan.providers) {
        const providerGoldens = plan.outputs
          .filter((o) => o.provider === provider && o.type === 'golden')
          .map((o) => o.skill);

        for (const scenario of SCENARIO_SKILLS) {
          console.log(
            JSON.stringify({
              event: 'provider_golden_parity',
              provider,
              scenario,
              included: providerGoldens.includes(scenario),
            })
          );

          expect(
            providerGoldens,
            `provider "${provider}" must include goldens for "${scenario}"`
          ).toContain(scenario);
        }
      }
    });

    it('scenario skills in build plan match source skills directory', () => {
      const plan = getBuildPlan();
      const planSkillNames = plan.skills.map((s) => s.name);

      for (const scenario of SCENARIO_SKILLS) {
        const sourceExists = existsSync(
          resolve(ROOT, `skills/${scenario}/SKILL.md`)
        );

        console.log(
          JSON.stringify({
            event: 'source_plan_parity',
            scenario,
            sourceExists,
            inPlan: planSkillNames.includes(scenario),
          })
        );

        expect(planSkillNames.includes(scenario)).toBe(sourceExists);
      }
    });
  });
});
