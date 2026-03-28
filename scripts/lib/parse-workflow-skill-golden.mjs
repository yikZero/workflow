#!/usr/bin/env node

/**
 * Extracts executable fixture data from a workflow skill golden markdown file.
 *
 * Usage:
 *   node scripts/lib/parse-workflow-skill-golden.mjs <golden-path>
 *
 * Exits 0 with JSON matching ExtractedGoldenFixture on success.
 * Exits 1 with a machine-readable error payload on failure.
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Section extraction
// ---------------------------------------------------------------------------

/**
 * Extract the content under a given markdown H2 heading.
 * Stops at the next H2 (or end of file).
 *
 * @param {string} text  Full markdown text
 * @param {string} heading  Heading text without the `## ` prefix
 * @returns {string|null}
 */
function extractSection(text, heading) {
  const lines = text.split('\n');
  const startPattern = `## ${heading}`;
  const startIdx = lines.findIndex((line) => line.trim() === startPattern);
  if (startIdx === -1) return null;

  // Find next H2 or end of file
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i].trim())) {
      endIdx = i;
      break;
    }
  }

  return lines
    .slice(startIdx + 1, endIdx)
    .join('\n')
    .trim();
}

/**
 * Extract the first fenced code block of a given language from a section.
 *
 * @param {string} sectionText
 * @param {string} language
 * @returns {string|null}
 */
function extractCodeFence(sectionText, language) {
  const lines = sectionText.split('\n');
  const startFence = '```' + language;
  const startIdx = lines.findIndex((line) => line.trim() === startFence);
  if (startIdx === -1) return null;

  const endIdx = lines.findIndex(
    (line, index) => index > startIdx && line.trim() === '```'
  );
  if (endIdx === -1) return null;

  return lines.slice(startIdx + 1, endIdx).join('\n');
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/**
 * @param {string} goldenPath
 * @param {string} section
 * @param {string} reason
 */
function fail(goldenPath, section, reason) {
  const error = {
    event: 'golden_parse_error',
    goldenPath,
    section,
    reason,
  };
  process.stderr.write(JSON.stringify(error) + '\n');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main parse logic
// ---------------------------------------------------------------------------

/**
 * @param {string} goldenPath  Relative or absolute path to the golden markdown
 * @param {string} text        Full markdown content
 * @returns {object}           ExtractedGoldenFixture
 */
function parseGolden(goldenPath, text) {
  const name = basename(goldenPath, '.md');

  // --- Verification Artifact (required, parsed first to get file paths) ---
  const artifactSection = extractSection(text, 'Verification Artifact');
  if (!artifactSection) {
    fail(goldenPath, 'Verification Artifact', 'section_missing');
  }

  const artifactJson = extractCodeFence(artifactSection, 'json');
  if (!artifactJson) {
    fail(goldenPath, 'Verification Artifact', 'code_fence_missing');
  }

  let verificationArtifact;
  try {
    verificationArtifact = JSON.parse(artifactJson);
  } catch (/** @type {any} */ e) {
    fail(goldenPath, 'Verification Artifact', `invalid_json: ${e.message}`);
  }

  // Validate required artifact keys
  const requiredArtifactKeys = [
    'contractVersion',
    'blueprintName',
    'files',
    'testMatrix',
    'runtimeCommands',
    'implementationNotes',
  ];
  const missingArtifactKeys = requiredArtifactKeys.filter(
    (k) => !(k in verificationArtifact)
  );
  if (missingArtifactKeys.length > 0) {
    fail(
      goldenPath,
      'Verification Artifact',
      `missing_keys: ${missingArtifactKeys.join(', ')}`
    );
  }

  // Build a lookup from artifact files: kind -> path
  const fileLookup = Object.fromEntries(
    verificationArtifact.files.map(
      (/** @type {{kind: string, path: string}} */ f) => [f.kind, f.path]
    )
  );

  // --- Expected Code Output (workflow — required) ---
  const workflowSection = extractSection(text, 'Expected Code Output');
  if (!workflowSection) {
    fail(goldenPath, 'Expected Code Output', 'section_missing');
  }

  const workflowCode = extractCodeFence(workflowSection, 'typescript');
  if (!workflowCode) {
    fail(goldenPath, 'Expected Code Output', 'code_fence_missing');
  }

  const workflowPath = fileLookup['workflow'] ?? null;
  if (!workflowPath) {
    fail(goldenPath, 'Verification Artifact', 'missing_file_kind: workflow');
  }

  // --- Expected Test Output (test — required) ---
  const testSection = extractSection(text, 'Expected Test Output');
  if (!testSection) {
    fail(goldenPath, 'Expected Test Output', 'section_missing');
  }

  const testCode = extractCodeFence(testSection, 'typescript');
  if (!testCode) {
    fail(goldenPath, 'Expected Test Output', 'code_fence_missing');
  }

  const testPath = fileLookup['test'] ?? null;
  if (!testPath) {
    fail(goldenPath, 'Verification Artifact', 'missing_file_kind: test');
  }

  // --- Expected Route Output (route — optional) ---
  let route = null;
  const routeSection = extractSection(text, 'Expected Route Output');
  if (routeSection) {
    const routeCode = extractCodeFence(routeSection, 'typescript');
    const routePath = fileLookup['route'] ?? null;
    if (routeCode && routePath) {
      route = { path: routePath, code: routeCode };
    }
  }

  return {
    name,
    sourcePath: goldenPath,
    workflow: { path: workflowPath, code: workflowCode },
    test: { path: testPath, code: testCode },
    route,
    verificationArtifact,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const goldenPath = process.argv[2];
if (!goldenPath) {
  process.stderr.write(
    JSON.stringify({
      event: 'golden_parse_error',
      goldenPath: null,
      section: 'argv',
      reason: 'usage: node parse-workflow-skill-golden.mjs <golden-path>',
    }) + '\n'
  );
  process.exit(1);
}

let text;
try {
  text = readFileSync(goldenPath, 'utf-8');
} catch (/** @type {any} */ e) {
  process.stderr.write(
    JSON.stringify({
      event: 'golden_parse_error',
      goldenPath,
      section: 'file_read',
      reason: e.message,
    }) + '\n'
  );
  process.exit(1);
}

const fixture = parseGolden(goldenPath, text);

// Structured success log to stderr, fixture JSON to stdout
process.stderr.write(
  JSON.stringify({
    event: 'golden_extracted',
    name: fixture.name,
    sourcePath: fixture.sourcePath,
    sections: {
      workflow: !!fixture.workflow,
      test: !!fixture.test,
      route: !!fixture.route,
      verificationArtifact: true,
    },
  }) + '\n'
);

process.stdout.write(JSON.stringify(fixture, null, 2) + '\n');
