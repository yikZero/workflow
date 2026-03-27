import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORKFLOW_SCENARIOS } from '../../../lib/ai/workflow-scenarios';

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

describe('workflow verification artifact contract', () => {
  it('every scenario has a canonical golden matching blueprintName', () => {
    for (const scenario of WORKFLOW_SCENARIOS) {
      const path = resolve(
        ROOT,
        'skills',
        scenario.name,
        'goldens',
        `${scenario.blueprintName}.md`
      );
      expect(existsSync(path), `missing ${path}`).toBe(true);
    }
  });

  it('verify hero golden contains a machine-readable verification artifact', () => {
    const content = readGolden(
      'skills/workflow-verify/goldens/approval-expiry-escalation.md'
    );
    expect(content).toContain('## Verification Artifact');

    const lines = content.split('\n');
    const artifactIdx = lines.findIndex((l) =>
      l.startsWith('## Verification Artifact')
    );
    const afterArtifact = lines.slice(artifactIdx).join('\n');
    const artifact = extractJsonFence(afterArtifact);

    expect(artifact).not.toBeNull();
    expect(artifact!.contractVersion).toBe('1');
    expect(artifact!.blueprintName).toBe('approval-expiry-escalation');
    expect(Array.isArray(artifact!.files)).toBe(true);
    expect(Array.isArray(artifact!.testMatrix)).toBe(true);
    expect(Array.isArray(artifact!.runtimeCommands)).toBe(true);
    expect(Array.isArray(artifact!.implementationNotes)).toBe(true);
  });

  it('verification artifact includes workflow, route, and test file plans', () => {
    const content = readGolden(
      'skills/workflow-verify/goldens/approval-expiry-escalation.md'
    );
    const lines = content.split('\n');
    const artifactIdx = lines.findIndex((l) =>
      l.startsWith('## Verification Artifact')
    );
    const afterArtifact = lines.slice(artifactIdx).join('\n');
    const artifact = extractJsonFence(afterArtifact) as {
      files: Array<{ kind: string; path: string }>;
    };

    const kinds = new Set(artifact.files.map((file) => file.kind));
    expect(kinds.has('workflow')).toBe(true);
    expect(kinds.has('route')).toBe(true);
    expect(kinds.has('test')).toBe(true);
  });
});
