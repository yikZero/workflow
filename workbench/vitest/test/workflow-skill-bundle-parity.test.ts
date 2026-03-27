import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

describe('workflow skill bundle parity', () => {
  it('docs and README mention workflow-init iff the source skill exists', () => {
    const docs = read(
      'docs/content/docs/getting-started/workflow-skills.mdx',
    );
    const readme = read('skills/README.md');
    const initExists = existsSync(
      resolve(ROOT, 'skills/workflow-init/SKILL.md'),
    );

    console.log(
      JSON.stringify({
        event: 'bundle_parity_check',
        skill: 'workflow-init',
        skillFileExists: initExists,
        docsContains: docs.includes('`workflow-init`'),
        readmeContains: readme.includes('`workflow-init`'),
      }),
    );

    expect(docs.includes('`workflow-init`')).toBe(initExists);
    expect(readme.includes('`workflow-init`')).toBe(initExists);
  });

  it('core skills all have SKILL.md files', () => {
    const coreSkills = ['workflow', 'workflow-teach', 'workflow-build'] as const;

    for (const skill of coreSkills) {
      const skillPath = resolve(ROOT, `skills/${skill}/SKILL.md`);
      const exists = existsSync(skillPath);

      console.log(
        JSON.stringify({
          event: 'core_skill_check',
          skill,
          exists,
        }),
      );

      expect(exists, `skills/${skill}/SKILL.md must exist`).toBe(true);
    }
  });
});
