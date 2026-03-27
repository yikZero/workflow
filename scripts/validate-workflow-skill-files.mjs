import { readFileSync, existsSync } from 'node:fs';
import { validateWorkflowSkillText } from './lib/validate-workflow-skill-files.mjs';
import { checks, allGoldenChecks } from './lib/workflow-skill-checks.mjs';

const allChecks = [...checks, ...allGoldenChecks];

function log(event, data = {}) {
  process.stderr.write(
    `${JSON.stringify({ event, ts: new Date().toISOString(), ...data })}\n`
  );
}

log('manifest_loaded', {
  skillChecks: checks.length,
  goldenChecks: allGoldenChecks.length,
  total: allChecks.length,
});

const filesByPath = {};
let loadedFiles = 0;
for (const check of allChecks) {
  if (filesByPath[check.file]) continue;
  if (!existsSync(check.file)) continue;
  filesByPath[check.file] = readFileSync(check.file, 'utf8');
  loadedFiles += 1;
}
log('files_loaded', { count: loadedFiles });

const result = validateWorkflowSkillText(allChecks, filesByPath);

for (const item of result.results) {
  log('check_evaluated', {
    ruleId: item.ruleId,
    file: item.file,
    status: item.status,
    reason: item.reason ?? null,
  });
}

const summary = result.results.reduce(
  (acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    if (item.outOfOrder) {
      acc.outOfOrder = (acc.outOfOrder ?? 0) + 1;
    }
    if (item.reason) {
      acc.reasons[item.reason] = (acc.reasons[item.reason] ?? 0) + 1;
    }
    return acc;
  },
  { pass: 0, fail: 0, error: 0, outOfOrder: 0, reasons: {} }
);

const output = {
  ...result,
  summary,
};

if (!result.ok) {
  log('validation_failed', {
    checked: result.checked,
    summary,
  });
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
}

log('validation_passed', {
  checked: result.checked,
  summary,
});
console.log(JSON.stringify(output, null, 2));
