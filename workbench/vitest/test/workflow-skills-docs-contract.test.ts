import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKFLOW_SCENARIOS } from '../../../lib/ai/workflow-scenarios';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

function extractJsonFenceAfter(
  text: string,
  marker: string
): Record<string, unknown> {
  const start = text.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const afterMarker = text.slice(start);
  const fenceStart = afterMarker.indexOf('```json');
  expect(fenceStart).toBeGreaterThanOrEqual(0);
  const fenceEnd = afterMarker.indexOf('\n```', fenceStart + 7);
  expect(fenceEnd).toBeGreaterThan(fenceStart);
  return JSON.parse(afterMarker.slice(fenceStart + 7, fenceEnd).trim());
}

describe('workflow skills docs contract surfaces', () => {
  it('keeps README quick-start aligned with scenario registry and emitted blueprint names', () => {
    const readme = read('skills/README.md');
    for (const scenario of WORKFLOW_SCENARIOS) {
      expect(readme).toContain(`/${scenario.name}`);
      expect(readme).toContain(
        `.workflow-skills/blueprints/${scenario.blueprintName}.json`
      );
    }
  });

  it('keeps the getting-started blueprint example contract-valid', () => {
    const docs = read('docs/content/docs/getting-started/workflow-skills.mdx');
    const blueprint = extractJsonFenceAfter(
      docs,
      'cat .workflow-skills/blueprints/approval-expiry-escalation.json'
    );
    expect(blueprint).toMatchObject({
      contractVersion: '1',
      name: 'approval-expiry-escalation',
    });
    for (const key of [
      'inputs',
      'steps',
      'suspensions',
      'streams',
      'tests',
      'antiPatternsAvoided',
      'invariants',
      'compensationPlan',
      'operatorSignals',
    ]) {
      expect(blueprint[key as keyof typeof blueprint]).toBeDefined();
    }
  });

  it('documents the full persisted artifact story honestly', () => {
    const docs = read('docs/content/docs/getting-started/workflow-skills.mdx');
    expect(docs).toContain('.workflow-skills/context.json');
    expect(docs).toContain('.workflow-skills/blueprints/<name>.json');
    expect(docs).toContain('updated in place');
    expect(docs).toContain('.workflow-skills/verification/<name>.json');
    expect(docs).not.toContain('no persisted file path is promised');
  });
});
