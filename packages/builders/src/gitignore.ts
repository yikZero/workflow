import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

function normalizeRelativePath(path: string): string {
  return path.split(sep).join('/');
}

function isOutsideRoot(path: string): boolean {
  return path === '..' || path.startsWith('../');
}

/**
 * Ensures the generated file's output directory contains a colocated
 * `.gitignore` entry for that file.
 *
 * Returns true when a new ignore entry was written.
 */
export async function ensureGeneratedFileGitignore({
  workingDir,
  filePath,
}: {
  workingDir: string;
  filePath: string;
}): Promise<boolean> {
  const resolvedWorkingDir = resolve(workingDir);
  const resolvedFilePath = resolve(resolvedWorkingDir, filePath);
  const relativePath = normalizeRelativePath(
    relative(resolvedWorkingDir, resolvedFilePath)
  );

  if (!relativePath || isOutsideRoot(relativePath)) {
    return false;
  }

  const outputDir = dirname(resolvedFilePath);
  if (outputDir === resolvedWorkingDir) {
    return false;
  }

  const gitignorePath = join(outputDir, '.gitignore');
  const entry = basename(resolvedFilePath);

  let existing = '';
  try {
    existing = await readFile(gitignorePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  const lines = existing.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes('*') || lines.includes(entry) || lines.includes(`/${entry}`)) {
    return false;
  }

  await mkdir(outputDir, { recursive: true });
  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  await writeFile(gitignorePath, `${existing}${separator}${entry}\n`);
  return true;
}
