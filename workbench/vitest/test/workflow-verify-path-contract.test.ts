import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf-8');
}

function extractJsonFenceAfter(
  text: string,
  marker: string
): Record<string, unknown> {
  const start = text.indexOf(marker);
  expect(start, `marker not found: ${marker}`).toBeGreaterThanOrEqual(0);
  const afterMarker = text.slice(start);
  const fenceStart = afterMarker.indexOf('```json');
  expect(fenceStart).toBeGreaterThanOrEqual(0);
  const fenceEnd = afterMarker.indexOf('\n```', fenceStart + 7);
  expect(fenceEnd).toBeGreaterThan(fenceStart);
  return JSON.parse(afterMarker.slice(fenceStart + 7, fenceEnd).trim());
}

describe('workflow-verify path contract', () => {
  const skillMd = read('skills/workflow-verify/SKILL.md');
  const goldenMd = read(
    'skills/workflow-verify/goldens/approval-expiry-escalation.md'
  );

  it('SKILL.md human-readable guidance uses integration test path', () => {
    expect(skillMd).toContain('workflows/<name>.integration.test.ts');
    expect(skillMd).not.toContain('__tests__/<name>.test.ts');
  });

  it('golden file table and JSON artifact agree on test file path', () => {
    const artifact = extractJsonFenceAfter(goldenMd, '## Verification Artifact');
    const files = artifact.files as Array<{
      path: string;
      kind: string;
    }>;
    const testFile = files.find((f) => f.kind === 'test');
    expect(testFile).toBeDefined();

    // The human-readable "Files to Create" table must reference the same path
    expect(goldenMd).toContain(testFile!.path);

    // And the path must follow the integration test convention
    expect(testFile!.path).toMatch(/^workflows\/.*\.integration\.test\.ts$/);
  });

  it('golden runtime commands reference the integration test path', () => {
    const artifact = extractJsonFenceAfter(goldenMd, '## Verification Artifact');
    const files = artifact.files as Array<{
      path: string;
      kind: string;
    }>;
    const testFile = files.find((f) => f.kind === 'test');
    expect(testFile).toBeDefined();

    // Runtime commands section must use the same path as the artifact
    const runtimeSection = goldenMd.slice(
      goldenMd.indexOf('## Runtime Verification Commands')
    );
    expect(runtimeSection).toContain(testFile!.path);
    expect(runtimeSection).not.toContain('__tests__/');
  });

  it('SKILL.md runtime commands use integration test path', () => {
    const runtimeSection = skillMd.slice(
      skillMd.indexOf('## Runtime Verification Commands')
    );
    expect(runtimeSection).toContain(
      'workflows/<workflow-name>.integration.test.ts'
    );
    expect(runtimeSection).not.toContain('__tests__/');
  });
});
