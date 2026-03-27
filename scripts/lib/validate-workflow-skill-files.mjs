/**
 * Pure validation logic for workflow skill files.
 * No filesystem access — accepts file contents as a map.
 */

function findOutOfOrder(text, values = []) {
  if (!Array.isArray(values) || values.length < 2) return [];

  const positions = values.map((value) => ({
    value,
    index: text.indexOf(value),
  }));

  if (positions.some((item) => item.index === -1)) return [];

  for (let i = 1; i < positions.length; i += 1) {
    if (positions[i].index < positions[i - 1].index) {
      return values;
    }
  }

  return [];
}

function buildFailureResult(check, missing, forbidden, outOfOrder = []) {
  return {
    ruleId: check.ruleId ?? `text.${check.file}`,
    severity: check.severity ?? 'error',
    file: check.file,
    status: 'fail',
    ...(missing.length > 0 ? { missing } : {}),
    ...(forbidden.length > 0 ? { forbidden } : {}),
    ...(outOfOrder.length > 0 ? { outOfOrder } : {}),
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
    const outOfOrder =
      missing.length === 0 ? findOutOfOrder(text, check.mustAppearInOrder) : [];

    if (missing.length > 0 || forbidden.length > 0 || outOfOrder.length > 0) {
      failed = true;
      results.push(buildFailureResult(check, missing, forbidden, outOfOrder));
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
