import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'dist', 'workflow-skills');
const SKILLS_DIR = join(ROOT, 'skills');

const PROVIDERS = ['claude-code', 'cursor'];
const PROVIDER_PATHS = {
  'claude-code': '.claude/skills',
  cursor: '.cursor/skills',
};

const LOOP_SKILLS = [
  'workflow-teach',
  'workflow-design',
  'workflow-stress',
  'workflow-verify',
];

function sha256(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
}

describe('build-workflow-skills builder smoke tests', () => {
  beforeAll(() => {
    if (existsSync(DIST)) {
      rmSync(DIST, { recursive: true, force: true });
    }
    run('node scripts/build-workflow-skills.mjs');
  });

  afterAll(() => {
    if (existsSync(DIST)) {
      rmSync(DIST, { recursive: true, force: true });
    }
  });

  // -----------------------------------------------------------------------
  // Manifest
  // -----------------------------------------------------------------------

  it('produces dist/workflow-skills/manifest.json', () => {
    const manifestPath = join(DIST, 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);
  });

  it('manifest is valid JSON with required fields', () => {
    const manifest = JSON.parse(
      readFileSync(join(DIST, 'manifest.json'), 'utf8'),
    );
    expect(manifest).toHaveProperty('generatedAt');
    expect(manifest).toHaveProperty('providers');
    expect(manifest).toHaveProperty('skills');
    expect(manifest).toHaveProperty('totalOutputs');
    expect(manifest.providers).toEqual(expect.arrayContaining(PROVIDERS));
    expect(manifest.skills.length).toBeGreaterThanOrEqual(LOOP_SKILLS.length);
    for (const skill of manifest.skills) {
      expect(skill).toHaveProperty('name');
      expect(skill).toHaveProperty('version');
      expect(skill).toHaveProperty('goldens');
      expect(skill).toHaveProperty('checksum');
    }
  });

  // -----------------------------------------------------------------------
  // Provider outputs — SKILL.md for each loop skill
  // -----------------------------------------------------------------------

  for (const provider of PROVIDERS) {
    for (const skill of LOOP_SKILLS) {
      const relPath = `${provider}/${PROVIDER_PATHS[provider]}/${skill}/SKILL.md`;

      it(`${relPath} exists`, () => {
        const p = join(DIST, provider, PROVIDER_PATHS[provider], skill, 'SKILL.md');
        expect(existsSync(p)).toBe(true);
      });

      it(`${relPath} matches source content`, () => {
        const src = readFileSync(join(SKILLS_DIR, skill, 'SKILL.md'), 'utf8');
        const dst = readFileSync(
          join(DIST, provider, PROVIDER_PATHS[provider], skill, 'SKILL.md'),
          'utf8',
        );
        expect(dst).toBe(src);
      });
    }
  }

  // -----------------------------------------------------------------------
  // Goldens copied alongside their parent skill
  // -----------------------------------------------------------------------

  it('goldens are copied beneath their parent skill in dist output', () => {
    const skillsWithGoldens = readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .filter((d) => {
        const gDir = join(SKILLS_DIR, d.name, 'goldens');
        return existsSync(gDir) && readdirSync(gDir).some((f) => f.endsWith('.md'));
      });

    expect(skillsWithGoldens.length).toBeGreaterThan(0);

    for (const skillEntry of skillsWithGoldens) {
      const srcGoldens = join(SKILLS_DIR, skillEntry.name, 'goldens');
      const goldenFiles = readdirSync(srcGoldens).filter((f) => f.endsWith('.md'));

      for (const provider of PROVIDERS) {
        for (const golden of goldenFiles) {
          const destGolden = join(
            DIST,
            provider,
            PROVIDER_PATHS[provider],
            skillEntry.name,
            'goldens',
            golden,
          );
          expect(
            existsSync(destGolden),
            `missing golden: ${provider}/${skillEntry.name}/goldens/${golden}`,
          ).toBe(true);

          const srcContent = readFileSync(join(srcGoldens, golden), 'utf8');
          const dstContent = readFileSync(destGolden, 'utf8');
          expect(dstContent).toBe(srcContent);
        }
      }
    }
  });

  // -----------------------------------------------------------------------
  // --check mode exits 0 and emits parseable JSON
  // -----------------------------------------------------------------------

  it('--check exits 0 and emits valid JSON plan', () => {
    const stdout = run('node scripts/build-workflow-skills.mjs --check');
    const plan = JSON.parse(stdout);
    expect(plan.ok).toBe(true);
    expect(plan.mode).toBe('check');
    expect(plan.providers).toEqual(expect.arrayContaining(PROVIDERS));
    expect(plan.outputs.length).toBeGreaterThan(0);
    expect(plan.totalOutputs).toBe(plan.outputs.length);

    for (const skill of LOOP_SKILLS) {
      expect(plan.skills.some((s) => s.name === skill)).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // Idempotence: second build is byte-stable
  // -----------------------------------------------------------------------

  describe('idempotence', () => {
    let manifestBefore;
    let fileHashesBefore;

    beforeAll(() => {
      // First build already ran in outer beforeAll.
      // Capture manifest and hashes of all files.
      manifestBefore = readFileSync(join(DIST, 'manifest.json'), 'utf8');
      fileHashesBefore = collectFileHashes(DIST);

      // Run a second build.
      run('node scripts/build-workflow-skills.mjs');
    });

    it('manifest.json is byte-stable across builds', () => {
      const manifestAfter = readFileSync(join(DIST, 'manifest.json'), 'utf8');
      // Strip generatedAt since timestamps differ
      const normalize = (m) => {
        const parsed = JSON.parse(m);
        delete parsed.generatedAt;
        return JSON.stringify(parsed, null, 2);
      };
      expect(normalize(manifestAfter)).toBe(normalize(manifestBefore));
    });

    it('non-manifest outputs are byte-identical across builds', () => {
      const fileHashesAfter = collectFileHashes(DIST);
      // Remove manifest from comparison (has timestamp)
      delete fileHashesBefore['manifest.json'];
      delete fileHashesAfter['manifest.json'];
      expect(fileHashesAfter).toEqual(fileHashesBefore);
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectFileHashes(dir, prefix = '') {
  const result = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      Object.assign(result, collectFileHashes(join(dir, entry.name), rel));
    } else {
      const content = readFileSync(join(dir, entry.name));
      result[rel] = sha256(content);
    }
  }
  return result;
}
