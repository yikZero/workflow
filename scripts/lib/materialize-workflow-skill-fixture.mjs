#!/usr/bin/env node

/**
 * Materializes extracted golden fixtures into runnable fixture directories.
 *
 * Usage:
 *   node scripts/lib/materialize-workflow-skill-fixture.mjs <spec-json-path>
 *
 * Reads the spec.json, parses the referenced golden, and writes:
 *   workflows/<name>.ts
 *   workflows/<name>.integration.test.ts
 *   vitest.integration.config.ts
 *   app/api/<name>/route.ts  (only when golden includes route output)
 *
 * Idempotent: re-running produces identical output for unchanged goldens.
 * Exits 0 on success with JSONL status lines to stderr.
 * Exits 1 on failure with machine-readable error to stderr.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const VITEST_CONFIG = `import { defineConfig } from 'vitest/config';
import { workflow } from '@workflow/vitest';

export default defineConfig({
  plugins: [workflow()],
  test: {
    include: ['**/*.integration.test.ts'],
    testTimeout: 60_000,
  },
});
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(event, fields = {}) {
  process.stderr.write(JSON.stringify({ event, ...fields }) + '\n');
}

function fail(reason, fields = {}) {
  log('materialize_error', { reason, ...fields });
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const specPath = process.argv[2];
if (!specPath) {
  fail('usage: node materialize-workflow-skill-fixture.mjs <spec-json-path>');
}

const absSpecPath = resolve(specPath);
if (!existsSync(absSpecPath)) {
  fail('spec_not_found', { specPath: absSpecPath });
}

let spec;
try {
  spec = JSON.parse(readFileSync(absSpecPath, 'utf-8'));
} catch (e) {
  fail('spec_parse_error', { specPath: absSpecPath, detail: e.message });
}

const { name, goldenPath } = spec;
if (!name || !goldenPath) {
  fail('spec_missing_fields', { specPath: absSpecPath, name, goldenPath });
}

log('materialize_start', { name, goldenPath });

// Resolve golden path relative to repo root (spec lives in tests/fixtures/...)
const repoRoot = resolve(dirname(absSpecPath), '..', '..', '..', '..');
const absGoldenPath = resolve(repoRoot, goldenPath);

if (!existsSync(absGoldenPath)) {
  fail('golden_not_found', { goldenPath: absGoldenPath });
}

// Run the parser to extract fixture data
const parserScript = resolve(
  repoRoot,
  'scripts/lib/parse-workflow-skill-golden.mjs'
);
let parsed;
try {
  const stdout = execFileSync('node', [parserScript, absGoldenPath], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  parsed = JSON.parse(stdout);
} catch (e) {
  fail('parser_failed', {
    goldenPath: absGoldenPath,
    detail: e.stderr || e.message,
  });
}

log('golden_extracted', { name: parsed.name, sourcePath: parsed.sourcePath });

// Determine fixture directory (same directory as spec.json)
const fixtureDir = dirname(absSpecPath);

// Validate required tokens from spec
const requires = spec.requires || {};
if (requires.workflow && parsed.workflow) {
  const missing = requires.workflow.filter(
    (tok) => !parsed.workflow.code.includes(tok)
  );
  if (missing.length > 0) {
    log('materialize_warning', {
      name,
      reason: 'missing_workflow_tokens',
      missing,
    });
  }
}
if (requires.test && parsed.test) {
  const missing = requires.test.filter(
    (tok) => !parsed.test.code.includes(tok)
  );
  if (missing.length > 0) {
    log('materialize_warning', {
      name,
      reason: 'missing_test_tokens',
      missing,
    });
  }
}

// Write files
const writtenFiles = [];

function writeFixtureFile(relPath, content) {
  const absPath = join(fixtureDir, relPath);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, 'utf-8');
  writtenFiles.push(relPath);
  log('file_written', { name, path: relPath });
}

// Workflow file
writeFixtureFile(parsed.workflow.path, parsed.workflow.code + '\n');

// Test file
writeFixtureFile(parsed.test.path, parsed.test.code + '\n');

// Vitest config
writeFixtureFile('vitest.integration.config.ts', VITEST_CONFIG);

// Route file (only when golden includes route output)
if (parsed.route) {
  writeFixtureFile(parsed.route.path, parsed.route.code + '\n');
}

log('materialize_complete', {
  name,
  fixtureDir: fixtureDir.replace(repoRoot + '/', ''),
  files: writtenFiles,
  hasRoute: !!parsed.route,
});

// Output manifest to stdout for machine consumption
process.stdout.write(
  JSON.stringify(
    {
      name,
      fixtureDir: fixtureDir.replace(repoRoot + '/', ''),
      files: writtenFiles,
      verificationArtifact: parsed.verificationArtifact,
    },
    null,
    2
  ) + '\n'
);
