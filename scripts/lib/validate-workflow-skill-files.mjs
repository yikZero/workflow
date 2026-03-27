/**
 * Pure validation logic for workflow skill files.
 * No filesystem access — accepts file contents as a map.
 */

function buildFailureResult(check, missing, forbidden) {
  return {
    ruleId: check.ruleId ?? `text.${check.file}`,
    severity: check.severity ?? 'error',
    file: check.file,
    status: 'fail',
    ...(missing.length > 0 ? { missing } : {}),
    ...(forbidden.length > 0 ? { forbidden } : {}),
    ...(check.suggestedFix ? { suggestedFix: check.suggestedFix } : {}),
  };
}

export function validateWorkflowSkillText(checks, filesByPath) {
  const results = [];
  let failed = false;

  for (const check of checks) {
    const text = filesByPath[check.file];
    if (typeof text !== 'string') {
      failed = true;
      results.push({
        ruleId: check.ruleId ?? `text.${check.file}`,
        severity: check.severity ?? 'error',
        file: check.file,
        status: 'error',
        error: 'file_not_found',
      });
      continue;
    }

    const missing = check.mustInclude.filter((value) => !text.includes(value));
    const forbidden = (check.mustNotInclude ?? []).filter((value) =>
      text.includes(value)
    );

    if (missing.length > 0 || forbidden.length > 0) {
      failed = true;
      results.push(buildFailureResult(check, missing, forbidden));
    } else {
      results.push({
        ruleId: check.ruleId ?? `text.${check.file}`,
        severity: check.severity ?? 'error',
        file: check.file,
        status: 'pass',
      });
    }
  }

  return {
    ok: !failed,
    checked: checks.length,
    results,
  };
}
