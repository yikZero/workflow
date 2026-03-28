import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';

/**
 * @typedef {'created' | 'ok' | 'repaired'} SymlinkStatus
 *
 * @typedef {{
 *   name: string,
 *   fixtureDir: string,
 *   repoRoot: string,
 *   linkName: string,
 *   targetAbs: string,
 *   log: (event: string, fields?: Record<string, unknown>) => void,
 *   fail: (reason: string, fields?: Record<string, unknown>) => never,
 * }} EnsureFixtureSymlinkInput
 *
 * @typedef {{
 *   link: string,
 *   target: string,
 *   status: SymlinkStatus,
 *   previousTarget?: string,
 * }} EnsureFixtureSymlinkResult
 */

/**
 * Ensure a fixture-local workspace-package symlink exists and points at the expected target.
 * Emits one of: symlink_created, symlink_ok, symlink_repaired, symlink_conflict, symlink_error.
 *
 * @param {EnsureFixtureSymlinkInput} input
 * @returns {EnsureFixtureSymlinkResult}
 */
export function ensureFixtureSymlink({
  name,
  fixtureDir,
  repoRoot,
  linkName,
  targetAbs,
  log,
  fail,
}) {
  const linkPath = join(fixtureDir, 'node_modules', linkName);
  const link = `node_modules/${linkName}`;
  const target = targetAbs.replace(repoRoot + '/', '');
  const expectedTarget = relative(dirname(linkPath), targetAbs);

  if (!existsSync(targetAbs)) {
    fail('symlink_target_not_found', { name, link, target });
  }

  // Track whether fail() was already called so the outer catch doesn't
  // swallow it as a generic symlink_error.
  let failCalled = false;
  function trackedFail(reason, fields) {
    failCalled = true;
    fail(reason, fields);
  }

  try {
    mkdirSync(dirname(linkPath), { recursive: true });

    try {
      const stat = lstatSync(linkPath);

      if (!stat.isSymbolicLink()) {
        log('symlink_conflict', {
          name,
          link,
          target,
          actualType: 'non_symlink',
        });
        trackedFail('symlink_path_conflict', {
          name,
          link,
          target,
          actualType: 'non_symlink',
        });
      }

      const actualTarget = readlinkSync(linkPath);
      if (actualTarget === expectedTarget) {
        log('symlink_ok', { name, link, target });
        return { link, target, status: 'ok' };
      }

      unlinkSync(linkPath);
      symlinkSync(expectedTarget, linkPath);
      log('symlink_repaired', {
        name,
        link,
        previousTarget: actualTarget,
        target,
      });
      return { link, target, status: 'repaired', previousTarget: actualTarget };
    } catch (e) {
      // Re-throw errors that originated from the fail() callback
      if (failCalled) {
        throw e;
      }
      // lstatSync throws ENOENT when the path doesn't exist at all
      if (e?.code !== 'ENOENT') {
        throw e;
      }
    }

    symlinkSync(expectedTarget, linkPath);
    log('symlink_created', { name, link, target });
    return { link, target, status: 'created' };
  } catch (e) {
    if (failCalled) {
      throw e;
    }
    fail('symlink_error', {
      name,
      link,
      target,
      detail: e instanceof Error ? e.message : String(e),
    });
  }
}
