import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureGeneratedFileGitignore } from './gitignore.js';

const realTmpdir = realpathSync(tmpdir());

describe('ensureGeneratedFileGitignore', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(realTmpdir, 'gitignore-manifest-'));
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('creates a colocated .gitignore entry for a generated manifest file', async () => {
    const changed = await ensureGeneratedFileGitignore({
      workingDir: testRoot,
      filePath: join(testRoot, '.well-known', 'workflow', 'manifest.js'),
    });

    expect(changed).toBe(true);
    expect(
      readFileSync(
        join(testRoot, '.well-known', 'workflow', '.gitignore'),
        'utf8'
      )
    ).toBe(
      'manifest.js\n'
    );
  });

  it('appends the manifest entry without clobbering existing content', async () => {
    mkdirSync(join(testRoot, 'generated'), { recursive: true });
    writeFileSync(
      join(testRoot, 'generated', '.gitignore'),
      'other-generated-file.js\n',
      'utf8'
    );

    const changed = await ensureGeneratedFileGitignore({
      workingDir: testRoot,
      filePath: join(testRoot, 'generated', 'manifest.json'),
    });

    expect(changed).toBe(true);
    expect(readFileSync(join(testRoot, 'generated', '.gitignore'), 'utf8')).toBe(
      'other-generated-file.js\nmanifest.json\n'
    );
  });

  it('does not duplicate an existing ignore entry', async () => {
    mkdirSync(join(testRoot, 'generated'), { recursive: true });
    writeFileSync(
      join(testRoot, 'generated', '.gitignore'),
      'manifest.js\n',
      'utf8'
    );

    const changed = await ensureGeneratedFileGitignore({
      workingDir: testRoot,
      filePath: join(testRoot, 'generated', 'manifest.js'),
    });

    expect(changed).toBe(false);
    expect(readFileSync(join(testRoot, 'generated', '.gitignore'), 'utf8')).toBe(
      'manifest.js\n'
    );
  });

  it('does not create a project root .gitignore for root-level outputs', async () => {
    const changed = await ensureGeneratedFileGitignore({
      workingDir: testRoot,
      filePath: join(testRoot, 'manifest.js'),
    });

    expect(changed).toBe(false);
    expect(() => readFileSync(join(testRoot, '.gitignore'), 'utf8')).toThrow();
  });

  it('does not modify .gitignore for files outside the working directory', async () => {
    const changed = await ensureGeneratedFileGitignore({
      workingDir: testRoot,
      filePath: join(testRoot, '..', 'manifest.js'),
    });

    expect(changed).toBe(false);
    expect(() => readFileSync(join(testRoot, '.gitignore'), 'utf8')).toThrow();
  });
});
