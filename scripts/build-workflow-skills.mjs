#!/usr/bin/env node

/**
 * build-workflow-skills.mjs
 *
 * Builds provider-specific bundles from the source skills under skills/.
 *
 * Usage:
 *   node scripts/build-workflow-skills.mjs           # build into dist/workflow-skills/
 *   node scripts/build-workflow-skills.mjs --check   # dry-run, emit plan as JSON, exit 0 if valid
 *
 * Emits structured JSON lines on stderr for every state transition.
 * Final output on stdout is a JSON manifest.
 */

import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname, '..');
const SKILLS_DIR = join(ROOT, 'skills');
const DIST_DIR = join(ROOT, 'dist', 'workflow-skills');

/** Provider map: provider name → nested output path under dist/<provider>/. */
const PROVIDERS = {
  'claude-code': '.claude/skills',
  cursor: '.cursor/skills',
};

const CHECK_MODE = process.argv.includes('--check');

// ---------------------------------------------------------------------------
// Logging helpers (structured JSON on stderr)
// ---------------------------------------------------------------------------

function log(event, data = {}) {
  const line = JSON.stringify({ event, ts: new Date().toISOString(), ...data });
  process.stderr.write(`${line}\n`);
}

// ---------------------------------------------------------------------------
// Frontmatter parser (minimal, zero-dep)
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = ['name', 'description'];
const REQUIRED_META = ['author', 'version'];
const SCENARIO_SKILLS = new Set([
  'workflow-approval',
  'workflow-webhook',
  'workflow-saga',
  'workflow-timeout',
  'workflow-idempotency',
  'workflow-observe',
]);

function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const raw = match[1];
  const fm = {};
  let currentKey = null;
  for (const line of raw.split('\n')) {
    const topLevel = line.match(/^([\w][\w.\-]*):\s*(.*)/);
    if (topLevel) {
      const [, key, val] = topLevel;
      if (key === 'metadata') {
        fm.metadata = fm.metadata || {};
        currentKey = 'metadata';
      } else {
        fm[key] = val.replace(/^['"]|['"]$/g, '').trim();
        currentKey = key;
      }
      continue;
    }
    const nested = line.match(/^\s{2}([\w][\w.\-]*):\s*(.*)/);
    if (nested && currentKey === 'metadata') {
      fm.metadata[nested[1]] = nested[2].replace(/^['"]|['"]$/g, '').trim();
    }
  }
  return fm;
}

function validateFrontmatter(fm, skillDir) {
  const errors = [];
  if (!fm) {
    errors.push(`${skillDir}: missing YAML frontmatter`);
    return errors;
  }
  for (const f of REQUIRED_FIELDS) {
    if (!fm[f]) errors.push(`${skillDir}: missing required field "${f}"`);
  }
  if (!fm.metadata) {
    errors.push(`${skillDir}: missing "metadata" block`);
  } else {
    for (const f of REQUIRED_META) {
      if (!fm.metadata[f]) errors.push(`${skillDir}: missing metadata.${f}`);
    }
  }

  // Scenario skills must have user-invocable and argument-hint
  if (SCENARIO_SKILLS.has(skillDir)) {
    if (fm['user-invocable'] !== 'true') {
      errors.push(`${skillDir}: scenario skill must set "user-invocable: true"`);
    }
    if (!fm['argument-hint']) {
      errors.push(`${skillDir}: scenario skill must provide "argument-hint"`);
    }
    log('scenario_validation', {
      skill: skillDir,
      'user-invocable': fm['user-invocable'] ?? null,
      'argument-hint': fm['argument-hint'] ?? null,
      valid: errors.length === 0,
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Discover skills
// ---------------------------------------------------------------------------

function discoverSkills() {
  const entries = readdirSync(SKILLS_DIR, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(SKILLS_DIR, entry.name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;
    const content = readFileSync(skillPath, 'utf8');
    const fm = parseFrontmatter(content);
    const goldensDir = join(SKILLS_DIR, entry.name, 'goldens');
    const goldens = existsSync(goldensDir)
      ? readdirSync(goldensDir).filter((f) => f.endsWith('.md'))
      : [];
    skills.push({
      dir: entry.name,
      skillPath,
      content,
      frontmatter: fm,
      goldens,
      goldensDir,
    });
  }
  return skills;
}

// ---------------------------------------------------------------------------
// Checksum helper
// ---------------------------------------------------------------------------

function sha256(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Plan: compute all outputs without writing
// ---------------------------------------------------------------------------

function buildPlan(skills) {
  const outputs = [];
  for (const [provider, nestedPath] of Object.entries(PROVIDERS)) {
    for (const skill of skills) {
      const destDir = join(DIST_DIR, provider, nestedPath, skill.dir);
      const destFile = join(destDir, 'SKILL.md');
      outputs.push({
        provider,
        skill: skill.dir,
        source: relative(ROOT, skill.skillPath),
        dest: relative(ROOT, destFile),
        checksum: sha256(skill.content),
        version: skill.frontmatter?.metadata?.version ?? 'unknown',
      });
      for (const golden of skill.goldens) {
        const src = join(skill.goldensDir, golden);
        const dest = join(destDir, 'goldens', golden);
        const goldenContent = readFileSync(src, 'utf8');
        outputs.push({
          provider,
          skill: skill.dir,
          source: relative(ROOT, src),
          dest: relative(ROOT, dest),
          checksum: sha256(goldenContent),
          type: 'golden',
        });
      }
    }
  }
  return outputs;
}

// ---------------------------------------------------------------------------
// Write: materialize files into dist/
// ---------------------------------------------------------------------------

function writeDist(skills, outputs) {
  for (const out of outputs) {
    const destAbs = join(ROOT, out.dest);
    mkdirSync(dirname(destAbs), { recursive: true });
    const srcAbs = join(ROOT, out.source);
    cpSync(srcAbs, destAbs);
    log('file_written', { dest: out.dest, checksum: out.checksum });
  }

  // Write manifest
  const manifest = {
    generatedAt: new Date().toISOString(),
    providers: Object.keys(PROVIDERS),
    skills: skills.map((s) => ({
      name: s.dir,
      version: s.frontmatter?.metadata?.version ?? 'unknown',
      goldens: s.goldens.length,
      checksum: sha256(s.content),
    })),
    totalOutputs: outputs.length,
  };
  const manifestPath = join(DIST_DIR, 'manifest.json');
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  log('manifest_written', { path: relative(ROOT, manifestPath) });
  return manifest;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  log('start', { mode: CHECK_MODE ? 'check' : 'build' });

  // 1. Discover
  const skills = discoverSkills();
  log('skills_discovered', {
    count: skills.length,
    names: skills.map((s) => s.dir),
  });

  if (skills.length === 0) {
    log('error', { message: 'No skills found under skills/' });
    process.exit(1);
  }

  // 2. Validate frontmatter
  const allErrors = [];
  for (const skill of skills) {
    const errors = validateFrontmatter(skill.frontmatter, skill.dir);
    if (errors.length > 0) {
      allErrors.push(...errors);
      log('validation_error', { skill: skill.dir, errors });
    } else {
      log('validation_pass', {
        skill: skill.dir,
        version: skill.frontmatter.metadata.version,
      });
    }
  }

  if (allErrors.length > 0) {
    log('validation_failed', {
      errorCount: allErrors.length,
      errors: allErrors,
    });
    process.exit(1);
  }

  // 3. Name/dir consistency check
  for (const skill of skills) {
    if (skill.frontmatter.name !== skill.dir) {
      log('validation_error', {
        skill: skill.dir,
        message: `frontmatter name "${skill.frontmatter.name}" does not match directory "${skill.dir}"`,
      });
      process.exit(1);
    }
  }

  // 4. Build plan
  const outputs = buildPlan(skills);
  log('plan_computed', {
    totalOutputs: outputs.length,
    providers: Object.keys(PROVIDERS),
  });

  // 5. Check mode: emit plan and exit
  if (CHECK_MODE) {
    const result = {
      ok: true,
      mode: 'check',
      skills: skills.map((s) => ({
        name: s.dir,
        version: s.frontmatter.metadata.version,
        goldens: s.goldens.length,
        checksum: sha256(s.content),
      })),
      providers: Object.keys(PROVIDERS),
      outputs: outputs.map((o) => ({
        provider: o.provider,
        skill: o.skill,
        dest: o.dest,
        checksum: o.checksum,
        ...(o.type ? { type: o.type } : {}),
      })),
      totalOutputs: outputs.length,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    log('check_complete', { ok: true, totalOutputs: outputs.length });
    process.exit(0);
  }

  // 6. Build mode: write files
  const manifest = writeDist(skills, outputs);
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  log('build_complete', { totalOutputs: outputs.length });
}

main();
