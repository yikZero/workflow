import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

const read = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf-8');

describe('hook runtime API docs stay aligned with runtime behavior', () => {
  it('documents hydrated hook metadata and the hook-object resumeHook overload', () => {
    const getHookDoc = read(
      'docs/content/docs/api-reference/workflow-api/get-hook-by-token.mdx'
    );
    const resumeHookDoc = read(
      'docs/content/docs/api-reference/workflow-api/resume-hook.mdx'
    );

    expect(getHookDoc).toContain(
      'Metadata is automatically hydrated (deserialized)'
    );
    expect(resumeHookDoc).toContain('token or hook object');
    expect(resumeHookDoc).toContain('await resumeHook(hook, data)');
    expect(resumeHookDoc).toContain('hook token or hook object');
  });

  it('does not imply getWorld() is imported from workflow/api', () => {
    const apiIndexDoc = read(
      'docs/content/docs/api-reference/workflow-api/index.mdx'
    );
    const getWorldDoc = read(
      'docs/content/docs/api-reference/workflow-api/get-world.mdx'
    );

    expect(getWorldDoc).toContain(
      'import { getWorld } from "workflow/runtime";'
    );

    expect(apiIndexDoc).toContain('workflow/api and workflow/runtime');
    expect(apiIndexDoc).toContain('from `workflow/runtime`');
    expect(apiIndexDoc).not.toContain(
      'API reference for runtime functions from the `workflow/api` package.'
    );
  });
});
