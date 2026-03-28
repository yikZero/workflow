import {
  mkdtempSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureFixtureSymlink } from './lib/ensure-workflow-fixture-symlink.mjs';

const tempRoots = [];

function makeWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'workflow-fixture-symlink-'));
  tempRoots.push(root);
  const repoRoot = join(root, 'repo');
  const fixtureDir = join(root, 'fixture');
  const workflowPkg = join(repoRoot, 'packages', 'workflow');
  mkdirSync(workflowPkg, { recursive: true });
  mkdirSync(fixtureDir, { recursive: true });
  return { repoRoot, fixtureDir, workflowPkg };
}

function makeHarness() {
  const events = [];
  return {
    events,
    log(event, fields = {}) {
      events.push({ event, ...fields });
    },
    fail(reason, fields = {}) {
      const error = new Error(reason);
      error.reason = reason;
      error.fields = fields;
      throw error;
    },
  };
}

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

describe('ensureFixtureSymlink', () => {
  it('creates the symlink on first run', () => {
    const { repoRoot, fixtureDir, workflowPkg } = makeWorkspace();
    const harness = makeHarness();

    const result = ensureFixtureSymlink({
      name: 'fixture-a',
      fixtureDir,
      repoRoot,
      linkName: 'workflow',
      targetAbs: workflowPkg,
      log: harness.log,
      fail: harness.fail,
    });

    const linkPath = join(fixtureDir, 'node_modules', 'workflow');
    expect(readlinkSync(linkPath)).toBe(
      relative(dirname(linkPath), workflowPkg)
    );
    expect(result).toMatchObject({
      link: 'node_modules/workflow',
      status: 'created',
    });
    expect(result.target.split('\\').join('/')).toBe('packages/workflow');
    expect(harness.events.at(-1)).toMatchObject({
      event: 'symlink_created',
      link: 'node_modules/workflow',
    });
  });

  it('emits symlink_ok on repeat runs', () => {
    const { repoRoot, fixtureDir, workflowPkg } = makeWorkspace();
    const harness = makeHarness();

    ensureFixtureSymlink({
      name: 'fixture-a',
      fixtureDir,
      repoRoot,
      linkName: 'workflow',
      targetAbs: workflowPkg,
      log: harness.log,
      fail: harness.fail,
    });

    const result = ensureFixtureSymlink({
      name: 'fixture-a',
      fixtureDir,
      repoRoot,
      linkName: 'workflow',
      targetAbs: workflowPkg,
      log: harness.log,
      fail: harness.fail,
    });

    expect(result).toMatchObject({
      link: 'node_modules/workflow',
      status: 'ok',
    });
    expect(harness.events.at(-1)).toMatchObject({
      event: 'symlink_ok',
      link: 'node_modules/workflow',
    });
  });

  it('repairs a mismatched symlink target', () => {
    const { repoRoot, fixtureDir, workflowPkg } = makeWorkspace();
    const oldPkg = join(repoRoot, 'packages', 'workflow-old');
    mkdirSync(oldPkg, { recursive: true });

    const linkPath = join(fixtureDir, 'node_modules', 'workflow');
    mkdirSync(dirname(linkPath), { recursive: true });
    symlinkSync(relative(dirname(linkPath), oldPkg), linkPath);

    const harness = makeHarness();
    const result = ensureFixtureSymlink({
      name: 'fixture-a',
      fixtureDir,
      repoRoot,
      linkName: 'workflow',
      targetAbs: workflowPkg,
      log: harness.log,
      fail: harness.fail,
    });

    expect(readlinkSync(linkPath)).toBe(
      relative(dirname(linkPath), workflowPkg)
    );
    expect(result).toMatchObject({
      link: 'node_modules/workflow',
      status: 'repaired',
    });
    expect(result.target.split('\\').join('/')).toBe('packages/workflow');
    expect(harness.events.at(-1)).toMatchObject({
      event: 'symlink_repaired',
      link: 'node_modules/workflow',
    });
  });

  it('fails with symlink_path_conflict when a normal file occupies the path', () => {
    const { repoRoot, fixtureDir, workflowPkg } = makeWorkspace();
    const linkPath = join(fixtureDir, 'node_modules', 'workflow');
    mkdirSync(dirname(linkPath), { recursive: true });
    writeFileSync(linkPath, 'occupied');

    const harness = makeHarness();
    expect(() =>
      ensureFixtureSymlink({
        name: 'fixture-a',
        fixtureDir,
        repoRoot,
        linkName: 'workflow',
        targetAbs: workflowPkg,
        log: harness.log,
        fail: harness.fail,
      })
    ).toThrow('symlink_path_conflict');
    expect(harness.events.at(-1)).toMatchObject({
      event: 'symlink_conflict',
      link: 'node_modules/workflow',
    });
  });
});
