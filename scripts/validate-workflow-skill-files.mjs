import { readFileSync, existsSync } from 'node:fs';
import { validateWorkflowSkillText } from './lib/validate-workflow-skill-files.mjs';
import { checks, allGoldenChecks } from './lib/workflow-skill-checks.mjs';

const SUMMARY_ONLY = process.argv.includes('--summary');
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

function buildCompletionEvent(result, summary) {
  return {
    event: 'workflow_skill_validation_complete',
    ok: result.ok,
    checked: result.checked,
    pass: summary.pass,
    fail: summary.fail,
    error: summary.error,
    outOfOrder: summary.outOfOrder,
    reasonCounts: summary.reasons,
  };
}

const completion = buildCompletionEvent(result, summary);

log('workflow_skill_validation_complete', {
  ok: completion.ok,
  checked: completion.checked,
  pass: completion.pass,
  fail: completion.fail,
  error: completion.error,
  outOfOrder: completion.outOfOrder,
  reasonCounts: completion.reasonCounts,
});

process.stdout.write(
  SUMMARY_ONLY
    ? `${JSON.stringify(completion)}\n`
    : `${JSON.stringify(output, null, 2)}\n`
);
process.exit(result.ok ? 0 : 1);
