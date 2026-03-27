import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

describe('workflow skills docs contract surfaces', () => {
  it('documents three persisted artifacts', () => {
    const docs = read('docs/content/docs/getting-started/workflow-skills.mdx');
    expect(docs).toContain('three persisted artifacts');
    expect(docs).toContain('.workflow-skills/context.json');
    expect(docs).toContain('.workflow-skills/blueprints/<name>.json');
    expect(docs).toContain('.workflow-skills/verification/<name>.json');
  });

  it('shows the full verification runtime command set', () => {
    const docs = read('docs/content/docs/getting-started/workflow-skills.mdx');
    expect(docs).toContain('"name": "typecheck"');
    expect(docs).toContain('"name": "test"');
    expect(docs).toContain('"name": "focused-workflow-test"');
  });

  it('keeps README aligned with persisted verification-plan language', () => {
    const readme = read('skills/README.md');
    expect(readme).toContain('produces a persisted verification plan');
    expect(readme).toContain('.workflow-skills/verification/<name>.json');
  });

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
