import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKFLOW_SCENARIOS } from '../../../lib/ai/workflow-scenarios';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const DOC_PATH = resolve(
  ROOT,
  'docs',
  'content',
  'docs',
  'getting-started',
  'workflow-skills.mdx'
);

function readDocs(): string {
  return readFileSync(DOC_PATH, 'utf-8');
}

describe('workflow skills getting-started docs', () => {
  const docs = readDocs();

  it('lists every scenario command from the registry', () => {
    for (const scenario of WORKFLOW_SCENARIOS) {
      expect(docs).toContain(`/${scenario.name}`);
    }
  });

  it('documents the full automatic teach/design/stress/verify loop', () => {
    for (const stage of ['Teach', 'Design', 'Stress', 'Verify']) {
      expect(docs).toContain(stage);
    }
  });

  it('uses the blueprint naming contract instead of the scenario command name', () => {
    expect(docs).not.toContain('.workflow-skills/blueprints/<scenario>.json');
    expect(docs).toContain('.workflow-skills/blueprints/<name>.json');
  });

  it('shows the emitted blueprint file for every scenario', () => {
    for (const scenario of WORKFLOW_SCENARIOS) {
      expect(docs).toContain(
        `.workflow-skills/blueprints/${scenario.blueprintName}.json`
      );
    }
  });

  it('documents the persisted verification artifact path', () => {
    expect(docs).toContain('.workflow-skills/verification/<name>.json');
  });

  it('shows both base skills and scenario skills in the install section', () => {
    for (const skill of [
      'workflow-init',
      'workflow',
      'workflow-teach',
      'workflow-design',
      'workflow-stress',
      'workflow-verify',
      ...WORKFLOW_SCENARIOS.map((scenario) => scenario.name),
    ]) {
      expect(docs).toContain(`\`${skill}\``);
    }
  });
});
