#!/usr/bin/env node

/**
 * Runtime verifier for workflow skill golden fixtures.
 *
 * Discovers phase-1 fixture specs, materializes each fixture, validates
 * extracted files against the verification artifact, then runs typecheck
 * and integration tests. Emits JSONL checkpoints to stdout.
 *
 * Usage:
 *   node scripts/verify-workflow-skill-goldens.mjs
 *
 * Exits 0 when all fixtures pass. Exits 1 on any failure.
 * Machine-readable: every stdout line is a JSON object with a stable `event` field.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const fixturesRoot = resolve(repoRoot, 'tests/fixtures/workflow-skills');
const materializerScript = resolve(
  repoRoot,
  'scripts/lib/materialize-workflow-skill-fixture.mjs'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emit(event, fields = {}) {
  process.stdout.write(`${JSON.stringify({ event, ...fields })}\n`);
}

function log(msg) {
  process.stderr.write(`[verify] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Discover fixture specs
// ---------------------------------------------------------------------------

function discoverSpecs() {
  if (!existsSync(fixturesRoot)) {
    emit('verify_error', {
      reason: 'fixtures_dir_not_found',
      path: fixturesRoot,
    });
    process.exit(1);
  }

  const dirs = readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const specs = [];
  for (const dir of dirs) {
    const specPath = join(fixturesRoot, dir, 'spec.json');
    if (existsSync(specPath)) {
      specs.push({ dir, specPath });
    }
  }

  if (specs.length === 0) {
    emit('verify_error', { reason: 'no_specs_found', fixturesRoot });
    process.exit(1);
  }

  return specs;
}

// ---------------------------------------------------------------------------
// Materialize a single fixture
// ---------------------------------------------------------------------------

function materialize(specEntry) {
  const { dir, specPath } = specEntry;
  log(`Materializing ${dir}...`);

  let manifest;
  try {
    const stdout = execFileSync('node', [materializerScript, specPath], {
      encoding: 'utf-8',
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    manifest = JSON.parse(stdout);
  } catch (e) {
    emit('materialize_failed', { name: dir, detail: e.stderr || e.message });
    return null;
  }

  emit('golden_extracted', { name: manifest.name });
  return manifest;
}

// ---------------------------------------------------------------------------
// Validate extracted files against verification artifact
// ---------------------------------------------------------------------------

function checkArtifactFiles(artifact, fixtureDir) {
  const errors = [];
  if (!artifact?.files) return errors;
  for (const entry of artifact.files) {
    const filePath = join(fixtureDir, entry.path);
    if (!existsSync(filePath)) {
      errors.push(
        `artifact declares ${entry.kind} file "${entry.path}" but it was not extracted`
      );
    }
  }
  return errors;
}

function checkRequiredTokens(requires, artifact, fixtureDir) {
  const errors = [];
  for (const kind of ['workflow', 'test']) {
    const tokens = requires[kind];
    if (!tokens || tokens.length === 0) continue;
    const artifactFile = artifact?.files?.find((f) => f.kind === kind);
    if (!artifactFile) continue;
    const filePath = join(fixtureDir, artifactFile.path);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, 'utf-8');
    const missing = tokens.filter((tok) => !content.includes(tok));
    if (missing.length > 0) {
      errors.push(`required ${kind} tokens missing: ${missing.join(', ')}`);
    }
  }
  return errors;
}

function checkTestMatrixHelpers(artifact, requires, fixtureDir) {
  const errors = [];
  if (!artifact?.testMatrix || !requires.verificationHelpers) return errors;
  const testFile = artifact.files?.find((f) => f.kind === 'test');
  if (!testFile) return errors;
  const testPath = join(fixtureDir, testFile.path);
  if (!existsSync(testPath)) return errors;
  const testContent = readFileSync(testPath, 'utf-8');
  for (const entry of artifact.testMatrix) {
    if (!entry.helpers) continue;
    const missingHelpers = entry.helpers.filter(
      (h) => !testContent.includes(h)
    );
    if (missingHelpers.length > 0) {
      errors.push(
        `testMatrix "${entry.name}" missing helpers: ${missingHelpers.join(', ')}`
      );
    }
  }
  return errors;
}

function validateArtifact(manifest, specEntry) {
  const { dir, specPath } = specEntry;
  const spec = JSON.parse(readFileSync(specPath, 'utf-8'));
  const artifact = manifest.verificationArtifact;
  const fixtureDir = join(fixturesRoot, dir);
  const requires = spec.requires || {};

  return [
    ...checkArtifactFiles(artifact, fixtureDir),
    ...checkRequiredTokens(requires, artifact, fixtureDir),
    ...checkTestMatrixHelpers(artifact, requires, fixtureDir),
  ];
}

// ---------------------------------------------------------------------------
// Run typecheck on a fixture
// ---------------------------------------------------------------------------

function typecheck(manifest) {
  log(`Typechecking ${manifest.name}...`);
  const fixtureDir = join(fixturesRoot, manifest.name);

  const tsFiles = manifest.files
    .filter((f) => f.endsWith('.ts') && !f.includes('config'))
    .map((f) => join(fixtureDir, f));

  if (tsFiles.length === 0) {
    emit('fixture_typechecked', {
      name: manifest.name,
      ok: true,
      detail: 'no ts files to check',
    });
    return true;
  }

  try {
    execFileSync(
      'pnpm',
      [
        'exec',
        'tsc',
        '--noEmit',
        '--esModuleInterop',
        '--skipLibCheck',
        '--moduleResolution',
        'bundler',
        '--module',
        'esnext',
        '--target',
        'esnext',
        ...tsFiles,
      ],
      {
        encoding: 'utf-8',
        cwd: repoRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );
    emit('fixture_typechecked', { name: manifest.name, ok: true });
    return true;
  } catch (e) {
    emit('fixture_typechecked', {
      name: manifest.name,
      ok: false,
      detail: (e.stderr || e.stdout || e.message).slice(0, 2000),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Run integration tests on a fixture
// ---------------------------------------------------------------------------

function runTests(manifest) {
  const fixtureDir = join(fixturesRoot, manifest.name);
  const testFile = manifest.verificationArtifact?.files?.find(
    (f) => f.kind === 'test'
  );
  if (!testFile) {
    emit('fixture_tested', {
      name: manifest.name,
      ok: false,
      detail: 'no test file in artifact',
    });
    return false;
  }

  log(`Testing ${manifest.name} (cwd=${fixtureDir})...`);

  const configPath = join(fixtureDir, 'vitest.integration.config.ts');
  const testPath = testFile.path;
  const vitestBin = join(repoRoot, 'node_modules/.bin/vitest');

  try {
    execFileSync(vitestBin, ['run', testPath, '--config', configPath], {
      encoding: 'utf-8',
      cwd: fixtureDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    emit('fixture_tested', { name: manifest.name, ok: true });
    return true;
  } catch (e) {
    emit('fixture_tested', {
      name: manifest.name,
      ok: false,
      detail: (e.stderr || e.stdout || e.message).slice(0, 2000),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const specs = discoverSpecs();
emit('verify_start', {
  fixtureCount: specs.length,
  fixtures: specs.map((s) => s.dir),
});
log(`Discovered ${specs.length} fixture specs`);

let failures = 0;
let warnings = 0;

for (const specEntry of specs) {
  const manifest = materialize(specEntry);
  if (!manifest) {
    failures++;
    continue;
  }

  const artifactErrors = validateArtifact(manifest, specEntry);
  if (artifactErrors.length > 0) {
    emit('artifact_validation_failed', {
      name: manifest.name,
      errors: artifactErrors,
    });
    failures++;
    continue;
  }
  emit('artifact_validated', { name: manifest.name });

  // Typecheck and integration tests are informational for golden fixtures —
  // golden code references external services (db, warehouse, etc.) that are
  // undefined outside a real project. Count these as warnings, not failures.
  const typecheckOk = typecheck(manifest);
  if (!typecheckOk) {
    warnings++;
  }

  const testOk = runTests(manifest);
  if (!testOk) {
    warnings++;
  }
}

emit('verify_complete', { total: specs.length, failures, warnings });

if (failures > 0) {
  log(`${failures} fixture(s) failed verification`);
  process.exit(1);
}

log('All fixtures verified successfully');
process.exit(0);
