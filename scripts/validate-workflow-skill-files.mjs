import { readFileSync, existsSync } from 'node:fs';
import { validateWorkflowSkillText } from './lib/validate-workflow-skill-files.mjs';
import {
  checks,
  goldenChecks,
  stressGoldenChecks,
  allChecks,
} from './lib/workflow-skill-checks.mjs';

// Emit machine-readable manifest counts
const manifest = {
  checks: checks.length,
  goldenChecks: goldenChecks.length,
  stressGoldenChecks: stressGoldenChecks.length,
  allChecks: allChecks.length,
};
console.error(JSON.stringify({ event: 'manifest_loaded', ...manifest }));

// Read all files into a map
const filesByPath = {};
for (const check of allChecks) {
  if (existsSync(check.file)) {
    filesByPath[check.file] = readFileSync(check.file, 'utf8');
  }
}

const result = validateWorkflowSkillText(allChecks, filesByPath);

if (!result.ok) {
  const errors = result.results.filter((r) => r.status !== 'pass');
  console.error(
    JSON.stringify({ ok: false, checked: result.checked, errors }, null, 2)
  );
  process.exit(1);
}

console.log(JSON.stringify({ ...result, manifest }, null, 2));
